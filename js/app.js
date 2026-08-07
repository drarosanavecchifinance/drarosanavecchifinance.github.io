// app.js — bootstrap + roteamento client-side (layout-base).
const NFapp = window.NF || (window.NF = {});

(function () {
  const el = NF.ui.el;
  const app = () => document.getElementById('app');

  const ROTAS = ['nature', 'academy', 'clinica', 'dashboard'];
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
      ),
      // Botão de login só quando a autenticação está ligada.
      NF_CONFIG.AUTH_DISABLED ? null : el('div', { class: 'nav-right' },
        logged
          ? el('button', { class: 'btn ghost', onclick: async () => { await NF.auth.logout(); NF.ui.toast('Você saiu'); location.hash = '#/nature'; boot(); } }, 'Sair')
          : el('button', { class: 'btn', onclick: abrirLogin }, 'Entrar')),
    );
    header.append(nav);
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

    const negocio = rota === 'nature' ? 'naturefac' : rota;
    const cfg = NF_CONFIG.NEGOCIOS[negocio];

    // Ferramenta 100% interna: nenhuma aba tem parte pública — todas abrem no financeiro.
    // Bloco financeiro (privado)
    const finBox = el('section', { class: 'nf-fin', style: `--accent:${cfg.accent}` });
    finBox.append(el('div', { class: 'nf-fin-head' },
      el('h2', {}, `${cfg.nome} — Financeiro`),
      el('button', { class: 'btn ghost', style: 'margin-left:auto;', onclick: () => NF.export.negocio(negocio) }, '⬇ Exportar Excel')));
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
