// app.js — bootstrap + roteamento client-side (layout-base).
const NFapp = window.NF || (window.NF = {});

(function () {
  const el = NF.ui.el;
  const app = () => document.getElementById('app');

  const ROTAS = ['nature', 'academy', 'clinica', 'dashboard', 'dda'];
  function rotaAtual() {
    const h = location.hash.replace('#/', '');
    return ROTAS.includes(h) ? h : 'nature';
  }

  // ---------- HEADER ----------
  function renderHeader() {
    const logged = NF.auth.isLogged();
    const rota = rotaAtual();
    const header = document.getElementById('nf-header');
    NF.ui.clear(header);

    const nav = el('nav', { class: 'nf-nav' + (NF_CONFIG.AUTH_DISABLED ? ' center' : '') },
      el('div', { class: 'tabs' },
        // Dashboard em primeiro
        logged ? el('a', { class: 'tab dash' + (rota === 'dashboard' ? ' active' : ''), href: '#/dashboard' }, 'Dashboard') : null,
        ...['nature', 'academy', 'clinica'].map(n => {
          const cfg = NF_CONFIG.NEGOCIOS[n === 'nature' ? 'naturefac' : n];
          return el('a', { class: 'tab' + (rota === n ? ' active' : ''), href: '#/' + n, style: `--accent:${cfg.accent}` }, cfg.nome);
        }),
        // Central de boletos (todas as empresas)
        el('a', { class: 'tab' + (rota === 'dda' ? ' active' : ''), href: '#/dda' }, 'DDA'),
      ),
      // Botão de login só quando a autenticação está ligada.
      NF_CONFIG.AUTH_DISABLED ? null : el('div', { class: 'nav-right' },
        logged
          ? el('button', { class: 'btn ghost', onclick: async () => { await NF.auth.logout(); NF.ui.toast('Você saiu'); location.hash = '#/nature'; boot(); } }, 'Sair')
          : el('button', { class: 'btn', onclick: abrirLogin }, 'Entrar')),
    );
    header.append(nav);
    // Aviso de contas a pagar (vencidas / vencendo) — fica no header, visível em toda tela.
    if (logged) { const aviso = el('div', { class: 'nf-aviso-wrap' }); header.append(aviso); avisosVencimento(aviso); }
  }

  // Avisos de vencimento: contas/boletos EM ABERTO vencidos, vencendo hoje ou nos
  // próximos 3 dias (todas as empresas). Clique leva ao DDA.
  async function avisosVencimento(mount) {
    try {
      const desp = (await NF.data.list('lancamentos')).filter(l => l.tipo === 'despesa' && l.pago !== true);
      if (!desp.length) return;
      const hoje = NF.util.hoje(), limite = NF.util.addDias(hoje, 3);
      const venc = d => d.vencimento || d.data;
      const vencidas = desp.filter(d => venc(d) < hoje);
      const doDia = desp.filter(d => venc(d) === hoje);
      const proximas = desp.filter(d => venc(d) > hoje && venc(d) <= limite);
      if (!vencidas.length && !doDia.length && !proximas.length) return;
      const sum = a => a.reduce((s, d) => s + d.valor, 0);
      const partes = [];
      if (vencidas.length) partes.push(`${vencidas.length} vencida(s) — ${NF.util.brl(sum(vencidas))}`);
      if (doDia.length) partes.push(`${doDia.length} vence(m) HOJE — ${NF.util.brl(sum(doDia))}`);
      if (proximas.length) partes.push(`${proximas.length} nos próximos 3 dias — ${NF.util.brl(sum(proximas))}`);
      mount.append(el('div', { class: 'nf-alert', style: 'cursor:pointer; margin:0 auto 12px; max-width:1100px;',
        onclick: () => { location.hash = '#/dda'; } },
        `⚠ Contas a pagar: ${partes.join(' · ')} — clique para abrir o DDA`));
    } catch (e) { console.error('[avisos]', e); }
  }

  // ---------- LOGIN ----------
  function abrirLogin() {
    NF.ui.modal({
      title: 'Entrar',
      campos: [
        { name: 'email', label: 'E-mail', type: 'email', required: true },
        { name: 'senha', label: 'Senha', type: 'password', required: true },
      ],
      submitLabel: 'Entrar',
      onSubmit: async (d) => {
        const r = await NF.auth.login(d.email, d.senha);
        if (r.ok) { NF.ui.toast('Bem-vindo!'); boot(); }
        else NF.ui.toast(r.error, 'err');
      },
    });
  }

  // ---------- LOGIN GATE ----------
  function gate(mount, msg) {
    mount.append(el('div', { class: 'nf-gate' },
      el('h3', {}, '🔒 Área financeira privada'),
      el('p', {}, msg || 'Faça login de administrador para acessar.'),
      el('button', { class: 'btn', onclick: abrirLogin }, 'Entrar')));
  }

  // ---------- ROTAS ----------
  async function renderRota() {
    const mount = NF.ui.clear(app());
    const rota = rotaAtual();
    const logged = NF.auth.isLogged();

    if (rota === 'dashboard') {
      if (!logged) return gate(mount, 'O dashboard consolidado é só para administradores.');
      return NF.dashboard.render(mount, 'consolidado');
    }

    if (rota === 'dda') {
      if (!logged) return gate(mount, 'Entre para ver os boletos (DDA).');
      return NF.dda.render(mount);
    }

    const negocio = rota === 'nature' ? 'naturefac' : rota;
    const cfg = NF_CONFIG.NEGOCIOS[negocio];

    // Ferramenta 100% interna: nenhuma aba tem parte pública — todas abrem no financeiro.
    // Bloco financeiro (privado)
    const finBox = el('section', { class: 'nf-fin', style: `--accent:${cfg.accent}` });
    finBox.append(el('div', { class: 'nf-fin-head' },
      el('h2', {}, `${cfg.nome} — Financeiro`),
      el('button', { class: 'btn ghost', style: 'margin-left:auto;', onclick: () => NF.export.negocio(negocio, NF.finance.abaAtiva) }, '⬇ Exportar Excel')));
    mount.append(finBox);
    const finBody = el('div', {});
    finBox.append(finBody);

    if (!logged) return gate(finBody, `Entre para gerenciar o financeiro da ${cfg.nome}.`);

    const extras = (NF.modules[rota === 'nature' ? 'nature' : rota]?.extras) || [];
    NF.finance.render(negocio, finBody, extras);
  }

  // ---------- BOOT ----------
  async function boot() {
    NF.dashboard.killCharts?.();
    renderHeader();
    await renderRota();
  }

  window.addEventListener('hashchange', boot);
  window.addEventListener('DOMContentLoaded', async () => {
    await NF.auth.init();     // carrega a sessão (login)
    await NF.seed();          // garante as formas de pagamento
    boot();
  });
})();
