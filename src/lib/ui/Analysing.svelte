<div class="card" role="status">
  <div class="spinner" aria-hidden="true"></div>
  <b>Analysing…</b>
  <span class="muted">Reading track and matching postcodes</span>
</div>

<style>
  .card {
    border: 2px dashed #c9c9c4;
    border-radius: 14px;
    padding: 32px 20px;
    text-align: center;
    background: var(--panel);
  }
  b {
    display: block;
    font-size: 18px;
    margin-bottom: 6px;
  }
  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--line);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 10px;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
