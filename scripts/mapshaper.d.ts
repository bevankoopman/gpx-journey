// mapshaper ships no type declarations; only the command runner is used.
declare module 'mapshaper' {
  const mapshaper: { runCommands(commands: string): Promise<void> };
  export default mapshaper;
}
