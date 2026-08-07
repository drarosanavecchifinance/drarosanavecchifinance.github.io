// dashboard.js — BI / análise (tela principal do admin). Consolida os 3 negócios.
const NFd = window.NF || (window.NF = {});

NF.dashboard = (() => {
  const el = NF.ui.el;
  let charts = [];
  function killCharts() { charts.forEach(c => c.destroy()); charts = []; }

  const MESES_ATRAS = 6;
  function ultimosMeses(n) {
    const arr = []; const d = new Date();
    for (let i = n - 1; i >= 0; i--) arr.push(new Date(d.getFullYear(), d.getMonth() - i, 1).toISOString().slice(0, 7));
    return arr;
  }
  function proximosMeses(n) {
    const arr = []; const d = new Date();
    for (let i = 0; i < n; i++) arr.push(new Date(d.getFullYear(), d.getMonth() + i, 1).toISOString().slice(0, 7));
    return arr;
  }

  // Paleta premium branco & dourado.
  const CORES = ['#b08d3f', '#7d7360', '#a88b54', '#4a463f', '#c2a24e', '#8a6d2b', '#d8c48a'];
  const GOLD = '#b08d3f', TAUPE = '#7d7360', VERDE = '#3f7d5a', VERMELHO = '#b25444';

  async function render(mount, scope = 'consolidado') {
    killCharts();
    NF.ui.clear(mount);
    const negocios = Object.keys(NF_CONFIG.NEGOCIOS);
    const alvo = scope === 'consolidado' ? negocios : [scope];

    // Carrega tudo e filtra pelo escopo.
    const [lancAll, cartAll, vendasAll, vendedoras] = await Promise.all([
      NF.data.list('lancamentos'), NF.data.list('carteira'),
      NF.data.list('vendas'), NF.data.list('vendedoras'),
    ]);
    const inScope = r => alvo.includes(r.negocio);
    const lanc = lancAll.filter(inScope), cart = cartAll.filter(inScope), vendas = vendasAll.filter(inScope);

    // --- Filtro de escopo ---
    const filtro = el('div', { class: 'nf-scope' },
      el('span', {}, 'Negócio:'),
      ...[{ id: 'consolidado', nome: 'Consolidado' }, ...negocios.map(n => NF_CONFIG.NEGOCIOS[n])].map(o =>
        el('button', { class: 'chip' + (scope === o.id ? ' active' : ''), onclick: () => render(mount, o.id) }, o.nome)));
    mount.append(el('div', { class: 'nf-dash-head' }, el('h2', {}, 'Dashboard & Análises'), filtro));

    // --- Cards do topo (mês corrente somando o escopo) ---
    const mesAtual = NF.util.mesDe(NF.util.hoje());
    let vendasMes = 0, recebMes = 0, carteira = 0, despMes = 0, nVendas = 0;
    vendas.forEach(v => { if (NF.util.mesDe(v.data_venda) === mesAtual) { vendasMes += v.valor_bruto; nVendas++; } });
    cart.forEach(c => {
      if (c.status === 'recebido' && NF.util.mesDe(c.data_recebido) === mesAtual) recebMes += c.valor_parcela_liquido;
      if (c.status !== 'recebido') carteira += c.valor_parcela_liquido;
    });
    lanc.forEach(l => { if (l.tipo === 'despesa' && NF.util.mesDe(l.data) === mesAtual) despMes += l.valor; });

    const card = (l, v, cls) => el('div', { class: `nf-card ${cls || ''}` }, el('span', { class: 'lbl' }, l), el('strong', {}, NF.util.brl(v)));
    mount.append(el('div', { class: 'nf-cards' },
      card('Vendas do mês', vendasMes, 'accent'),
      card('Recebido no mês', recebMes, ''),
      card('Carteira (a receber)', carteira, 'warn'),
      card('Despesas do mês', despMes, 'neg'),
      card('Saldo do mês', vendasMes - despMes, (vendasMes - despMes) >= 0 ? 'pos' : 'neg'),
    ));
    mount.append(el('p', { class: 'nf-hint' }, `Ticket médio ${NF.util.brl(nVendas ? vendasMes / nVendas : 0)} · ${nVendas} venda(s) no mês.`));

    // --- Grid de gráficos ---
    const grid = el('div', { class: 'nf-charts' });
    mount.append(grid);
    const canvasBox = (titulo) => {
      const box = el('div', { class: 'nf-chart-box' }, el('h4', {}, titulo));
      const cv = el('canvas'); box.append(cv); grid.append(box); return cv;
    };

    // 1) Fluxo de caixa: recebido x despesa por mês (últimos 6)
    const meses = ultimosMeses(MESES_ATRAS);
    const receb = meses.map(m => cart.filter(c => c.status === 'recebido' && NF.util.mesDe(c.data_recebido) === m).reduce((s, c) => s + c.valor_parcela_liquido, 0));
    const desp = meses.map(m => lanc.filter(l => l.tipo === 'despesa' && NF.util.mesDe(l.data) === m).reduce((s, l) => s + l.valor, 0));
    charts.push(new Chart(canvasBox('Fluxo de caixa (recebido × despesas)'), {
      type: 'bar',
      data: { labels: meses.map(NF.util.mesLabel), datasets: [
        { label: 'Recebido', data: receb, backgroundColor: VERDE },
        { label: 'Despesas', data: desp, backgroundColor: VERMELHO },
      ] },
      options: baseOpts(),
    }));

    // 2) Vendas por vendedora (com botão pra ver detalhado por empresa)
    const vMap = Object.fromEntries(vendedoras.map(v => [v.id, v.nome]));
    const porV = {};
    vendas.forEach(v => { const n = vMap[v.vendedora_id] || 'Sem vendedora'; porV[n] = (porV[n] || 0) + v.valor_bruto; });
    const cvVend = canvasBox('Vendas por vendedora');
    charts.push(new Chart(cvVend, {
      type: 'bar',
      data: { labels: Object.keys(porV), datasets: [{ label: 'Vendido (bruto)', data: Object.values(porV), backgroundColor: GOLD }] },
      // horizontal: o dinheiro fica no eixo X; o Y mostra os nomes das vendedoras.
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { position: 'bottom' } }, scales: { x: { ticks: { callback: v => 'R$ ' + v } } } },
    }));
    cvVend.closest('.nf-chart-box').append(
      el('button', { class: 'btn ghost tiny', style: 'margin-top:14px;', onclick: () => vendedorasDetalhe(mount) }, 'Ver detalhado por empresa →'));

    // 3) Faturamento × Carteira (projeção do que cai nos próximos meses)
    const fut = proximosMeses(MESES_ATRAS);
    const proj = fut.map(m => cart.filter(c => c.status !== 'recebido' && NF.util.mesDe(c.data_prevista) === m).reduce((s, c) => s + c.valor_parcela_liquido, 0));
    const cvCart = canvasBox('Carteira — projeção de recebimento (líquido)');
    charts.push(new Chart(cvCart, {
      type: 'line',
      data: { labels: fut.map(NF.util.mesLabel), datasets: [{ label: 'A receber', data: proj, borderColor: GOLD, backgroundColor: 'rgba(176,141,63,.12)', pointBackgroundColor: GOLD, fill: true, tension: .3 }] },
      options: baseOpts(),
    }));
    cvCart.closest('.nf-chart-box').append(
      el('button', { class: 'btn ghost tiny', style: 'margin-top:14px;', onclick: () => carteiraDetalhe(mount) }, 'Ver detalhado por mês/empresa →'));

    // 4) Despesas por categoria
    const porCat = {};
    lanc.filter(l => l.tipo === 'despesa').forEach(l => { const c = l.categoria || 'Outros'; porCat[c] = (porCat[c] || 0) + l.valor; });
    charts.push(new Chart(canvasBox('Despesas por categoria'), {
      type: 'doughnut',
      data: { labels: Object.keys(porCat), datasets: [{ data: Object.values(porCat), backgroundColor: CORES }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
    }));

    // 5) Faturamento por negócio (só no consolidado)
    if (scope === 'consolidado') {
      const porNeg = negocios.map(n => vendasAll.filter(v => v.negocio === n && NF.util.mesDe(v.data_venda) === mesAtual).reduce((s, v) => s + v.valor_bruto, 0));
      charts.push(new Chart(canvasBox('Faturamento do mês por negócio'), {
        type: 'bar',
        data: { labels: negocios.map(n => NF_CONFIG.NEGOCIOS[n].nome), datasets: [{ label: 'Vendas do mês', data: porNeg, backgroundColor: negocios.map(n => NF_CONFIG.NEGOCIOS[n].accent) }] },
        options: baseOpts(),
      }));
    }

    // Carteira em atraso (destaque)
    const atrasadas = cart.filter(c => c.status !== 'recebido' && c.data_prevista < NF.util.hoje());
    if (atrasadas.length) {
      const total = atrasadas.reduce((s, c) => s + c.valor_parcela_liquido, 0);
      mount.append(el('div', { class: 'nf-alert' }, `⚠ ${atrasadas.length} parcela(s) em atraso, somando ${NF.util.brl(total)} a receber.`));
    }
  }

  // Detalhe: vendido por vendedora QUEBRADO por empresa (Vendedora × NatureFace × Academy × Clínica × Total).
  async function vendedorasDetalhe(mount) {
    killCharts();
    NF.ui.clear(mount);
    const negocios = Object.keys(NF_CONFIG.NEGOCIOS);
    const [vendas, vendedoras] = await Promise.all([NF.data.list('vendas'), NF.data.list('vendedoras')]);
    const vMap = Object.fromEntries(vendedoras.map(v => [v.id, v.nome]));

    // matriz nome -> { negocio: total } — só vendas com vendedora VÁLIDA (exclui
    // sem vendedora e vendedora excluída/inexistente, que apareciam como "—").
    const m = {};
    vendas.forEach(v => {
      const nome = vMap[v.vendedora_id];
      if (!nome) return;
      (m[nome] || (m[nome] = {}))[v.negocio] = (m[nome][v.negocio] || 0) + v.valor_bruto;
    });

    mount.append(el('div', { class: 'nf-dash-head' },
      el('h2', {}, 'Vendas por vendedora — por empresa'),
      el('button', { class: 'btn ghost', onclick: () => render(mount, 'consolidado') }, '← Voltar ao dashboard')));

    const linhas = Object.entries(m).map(([nome, mm]) => {
      const linha = { nome };
      let total = 0;
      negocios.forEach(n => { linha[n] = mm[n] || 0; total += linha[n]; });
      linha.total = total;
      return linha;
    }).sort((a, b) => b.total - a.total);

    // linha de total geral
    const totalGeral = { nome: 'Total geral' };
    let tg = 0;
    negocios.forEach(n => { totalGeral[n] = linhas.reduce((s, l) => s + l[n], 0); tg += totalGeral[n]; });
    totalGeral.total = tg;
    linhas.push(totalGeral);

    const cols = [
      { key: 'nome', label: 'Vendedora' },
      ...negocios.map(n => ({ key: n, label: NF_CONFIG.NEGOCIOS[n].nome, fmt: v => NF.util.brl(v) })),
      { key: 'total', label: 'Total', fmt: v => `<span class="nf-num">${NF.util.brl(v)}</span>` },
    ];
    mount.append(NF.ui.table(cols, linhas));
    mount.append(el('p', { class: 'nf-hint' }, 'Valores em bruto (faturamento por competência), somando todas as vendas.'));
  }

  // Detalhe: carteira a receber (líquido) QUEBRADA por mês × empresa.
  async function carteiraDetalhe(mount) {
    killCharts();
    NF.ui.clear(mount);
    const negocios = Object.keys(NF_CONFIG.NEGOCIOS);
    const cart = (await NF.data.list('carteira')).filter(c => c.status !== 'recebido');

    // matriz mês -> { negocio: total líquido }
    const m = {};
    cart.forEach(c => {
      const mes = NF.util.mesDe(c.data_prevista);
      (m[mes] || (m[mes] = {}))[c.negocio] = (m[mes][c.negocio] || 0) + c.valor_parcela_liquido;
    });

    mount.append(el('div', { class: 'nf-dash-head' },
      el('h2', {}, 'Carteira a receber — por mês e empresa'),
      el('button', { class: 'btn ghost', onclick: () => render(mount, 'consolidado') }, '← Voltar ao dashboard')));

    const meses = Object.keys(m).sort();
    const linhas = meses.map(mes => {
      const linha = { mes: NF.util.mesLabel(mes) };
      let total = 0;
      negocios.forEach(n => { linha[n] = m[mes][n] || 0; total += linha[n]; });
      linha.total = total;
      return linha;
    });
    const totalGeral = { mes: 'Total geral' };
    let tg = 0;
    negocios.forEach(n => { totalGeral[n] = linhas.reduce((s, l) => s + l[n], 0); tg += totalGeral[n]; });
    totalGeral.total = tg;
    linhas.push(totalGeral);

    const cols = [
      { key: 'mes', label: 'Mês' },
      ...negocios.map(n => ({ key: n, label: NF_CONFIG.NEGOCIOS[n].nome, fmt: v => NF.util.brl(v) })),
      { key: 'total', label: 'A receber', fmt: v => `<span class="nf-num">${NF.util.brl(v)}</span>` },
    ];
    mount.append(NF.ui.table(cols, linhas));
    mount.append(el('p', { class: 'nf-hint' }, 'Valores líquidos (com a taxa já descontada), só o que ainda está a receber.'));
  }

  function baseOpts() {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { ticks: { callback: v => 'R$ ' + v } } },
    };
  }

  return { render, killCharts };
})();
