/**
 * Builds the app's postcode data from ABS open data (CC BY 4.0):
 *   src/data/postcodes/<dataset>.topo.json        simplified boundaries: layer `postcodes`, one feature per postcode ({ code })
 *   src/data/postcodes/<dataset>.localities.json  { [postcode]: up to 3 locality names, most populous first }
 *
 * Usage: npm run data:postcodes [-- <dataset>]   (default: poa-2021)
 * Raw downloads are cached in .cache/abs/<dataset>/ (gitignored); the outputs are committed.
 * Decisions: "Postcode data delivery and matching design" (issue #5).
 */
import ExcelJS from 'exceljs';
import mapshaper from 'mapshaper';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const ABS = 'https://www.abs.gov.au';
const ASGS3 = `${ABS}/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads`;
const ASGS3_ALLOC = `${ABS}/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/allocation-files`;

interface Dataset {
  /** Zipped Shapefile of postal areas, and its postcode field. */
  boundaries: { url: string; codeField: string };
  /** Mesh block → postcode allocation. */
  postcodeAllocation: { url: string; mbField: string; codeField: string };
  /** Mesh block → suburb/locality allocation; area ranks localities where nobody lives. */
  localityAllocation: { url: string; mbField: string; nameField: string; areaField: string };
  /** Census mesh block counts (persons), one sheet per state part. */
  meshBlockCounts: { url: string; mbField: string; personsField: string };
}

// POA 2026 (ASGS Edition 4) is not yet released; add it here when it is.
const DATASETS: Record<string, Dataset> = {
  'poa-2021': {
    boundaries: {
      url: `${ASGS3}/digital-boundary-files/POA_2021_AUST_GDA2020_SHP.zip`,
      codeField: 'POA_CODE21',
    },
    postcodeAllocation: {
      url: `${ASGS3_ALLOC}/POA_2021_AUST.xlsx`,
      mbField: 'MB_CODE_2021',
      codeField: 'POA_CODE_2021',
    },
    localityAllocation: {
      url: `${ASGS3_ALLOC}/SAL_2021_AUST.xlsx`,
      mbField: 'MB_CODE_2021',
      nameField: 'SAL_NAME_2021',
      areaField: 'AREA_ALBERS_SQKM',
    },
    meshBlockCounts: {
      url: `${ABS}/census/guide-census-data/mesh-block-counts/2021/Mesh%20Block%20Counts%2C%202021.xlsx`,
      mbField: 'MB_CODE_2021',
      personsField: 'Person',
    },
  },
};

const SIMPLIFY_INTERVAL_M = 25;
const QUANTIZATION = 1_000_000;
const LOCALITIES_PER_POSTCODE = 3;
const MAX_UNNAMED_SHARE = 0.01;

/** ABS disambiguates locality names with a state suffix, e.g. "Newtown (NSW)" or "Newtown (Toowoomba - Qld)". */
const STATE_SUFFIX = /\s+\([^()]*\b(NSW|Vic\.|Qld|SA|WA|Tas\.|NT|ACT|OT)\)$/;
/** Non-spatial special-purpose "localities" that never appear on a route. */
const SPECIAL_LOCALITY = /^(No usual address|Migratory - Offshore - Shipping|Outside Australia)\b/;

async function download(url: string, dir: string): Promise<string> {
  const file = join(dir, decodeURIComponent(url.split('/').at(-1)!));
  if (existsSync(file)) return file;
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(`${file}.part`));
  await rename(`${file}.part`, file);
  return file;
}

/**
 * Streams every data row of every sheet whose header row has all `required` columns, as { column: value }.
 * Throws if no sheet has them, so a renamed column fails loudly instead of yielding nothing.
 */
async function* sheetRows(file: string, required: string[]): AsyncGenerator<Record<string, unknown>> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, { sharedStrings: 'cache', worksheets: 'emit' });
  let found = false;
  for await (const sheet of reader) {
    let columns: string[] | null = null;
    for await (const row of sheet) {
      const values = (row.values as unknown[]).slice(1);
      if (!columns) {
        // Header rows can sit below a title block (the Census tables start at row 7).
        if (required.every((name) => values.includes(name))) {
          columns = values.map(String);
          found = true;
        }
        continue;
      }
      yield Object.fromEntries(columns.map((name, i) => [name, values[i]]));
    }
  }
  if (!found) throw new Error(`${file}: no sheet has columns ${required.join(', ')}`);
}

async function buildBoundaries(d: Dataset, zip: string, out: string): Promise<void> {
  const f = d.boundaries.codeField;
  await mapshaper.runCommands(
    `-i "${zip}" -filter remove-empty -filter-fields ${f} -rename-fields code=${f} ` +
      `-simplify interval=${SIMPLIFY_INTERVAL_M} keep-shapes -rename-layers postcodes ` +
      `-o "${out}" format=topojson quantization=${QUANTIZATION}`,
  );
}

async function buildLocalities(
  d: Dataset,
  files: { postcodes: string; localities: string; counts: string },
): Promise<Record<string, string[]>> {
  const { postcodeAllocation: pa, localityAllocation: la, meshBlockCounts: mc } = d;

  const postcodeOf = new Map<string, string>();
  for await (const r of sheetRows(files.postcodes, [pa.mbField, pa.codeField])) {
    postcodeOf.set(String(r[pa.mbField]), String(r[pa.codeField]));
  }
  const persons = new Map<string, number>();
  for await (const r of sheetRows(files.counts, [mc.mbField, mc.personsField])) {
    persons.set(String(r[mc.mbField]), Number(r[mc.personsField]) || 0);
  }

  // postcode → locality → [people, area]; area breaks ties where nobody lives (parks, industrial).
  const tally = new Map<string, Map<string, [number, number]>>();
  for await (const r of sheetRows(files.localities, [la.mbField, la.nameField, la.areaField])) {
    const mb = String(r[la.mbField]);
    const postcode = postcodeOf.get(mb);
    const raw = String(r[la.nameField]);
    if (!postcode || SPECIAL_LOCALITY.test(raw)) continue;
    const name = raw.replace(STATE_SUFFIX, '');
    const byName = tally.get(postcode) ?? new Map<string, [number, number]>();
    const [people, area] = byName.get(name) ?? [0, 0];
    byName.set(name, [people + (persons.get(mb) ?? 0), area + (Number(r[la.areaField]) || 0)]);
    tally.set(postcode, byName);
  }

  return Object.fromEntries(
    [...tally]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([postcode, byName]) => [
        postcode,
        [...byName]
          .sort(([, [pa, aa]], [, [pb, ab]]) => pb - pa || ab - aa)
          .slice(0, LOCALITIES_PER_POSTCODE)
          .map(([name]) => name),
      ]),
  );
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
async function sizes(file: string): Promise<string> {
  const buf = await readFile(file);
  return `${kb(buf.length)} raw, ${kb(gzipSync(buf, { level: 9 }).length)} gzip, ${kb(brotliCompressSync(buf).length)} brotli`;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'poa-2021';
  const d = DATASETS[name];
  if (!d) throw new Error(`Unknown dataset "${name}". Known: ${Object.keys(DATASETS).join(', ')}`);

  const cache = join('.cache', 'abs', name);
  const outDir = join('src', 'data', 'postcodes');
  await mkdir(cache, { recursive: true });
  await mkdir(outDir, { recursive: true });

  const [zip, postcodes, localities, counts] = await Promise.all([
    download(d.boundaries.url, cache),
    download(d.postcodeAllocation.url, cache),
    download(d.localityAllocation.url, cache),
    download(d.meshBlockCounts.url, cache),
  ]);

  // Outputs are written beside their targets and moved into place only once both succeed.
  const topoOut = join(outDir, `${name}.topo.json`);
  const locOut = join(outDir, `${name}.localities.json`);
  const topoTmp = `${topoOut}.tmp`;
  await buildBoundaries(d, zip, topoTmp);

  console.log('Joining mesh blocks to localities and population…');
  const byPostcode = await buildLocalities(d, { postcodes, localities, counts });
  const topo = JSON.parse(await readFile(topoTmp, 'utf8')) as {
    objects: Record<string, { geometries: { properties?: { code?: string } }[] }>;
  };
  const codes = Object.values(topo.objects).flatMap((o) => o.geometries.map((g) => g.properties?.code));
  const withoutNames = codes.filter((c) => !c || !byPostcode[c]?.length);
  // A few unnamed postcodes would be odd; many means the joins broke (e.g. a renamed column or code format).
  if (withoutNames.length > MAX_UNNAMED_SHARE * codes.length) {
    throw new Error(
      `Too many postcodes without locality names (${withoutNames.length}); check the allocation files`,
    );
  }
  if (withoutNames.length > 0) console.warn(`  warning: unnamed postcodes: ${withoutNames.join(', ')}`);

  await writeFile(locOut, JSON.stringify(byPostcode) + '\n');
  await rename(topoTmp, topoOut);

  console.log(`\n${name}: ${codes.length} postcodes with boundaries`);
  console.log(`  ${topoOut}: ${await sizes(topoOut)}`);
  console.log(`  ${locOut}: ${await sizes(locOut)} (${Object.keys(byPostcode).length} postcodes)`);
  console.log(`  postcodes with boundaries but no locality names: ${withoutNames.length}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
