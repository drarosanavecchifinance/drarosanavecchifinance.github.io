// auth.js — login via Supabase Auth (e-mail/senha). Sessão compartilha o cliente NF.sb.
const NFa = window.NF || (window.NF = {});

NF.auth = (() => {
  const sb = () => NF.sb;
  let sessionUser = null;

  // Carrega a sessão atual (chamar no boot, antes de renderizar).
  async function init() {
    try {
      const { data } = await sb().auth.getSession();
      sessionUser = data.session?.user || null;
      sb().auth.onAuthStateChange((_e, session) => { sessionUser = session?.user || null; });
    } catch (e) { console.error('[auth.init]', e); }
    return sessionUser;
  }

  function user() { return sessionUser; }
  function isLogged() { return NF_CONFIG.AUTH_DISABLED || !!sessionUser; }

  async function login(email, senha) {
    const { data, error } = await sb().auth.signInWithPassword({ email: (email || '').trim(), password: senha });
    if (error) return { ok: false, error: 'E-mail ou senha inválidos.' };
    sessionUser = data.user;
    return { ok: true };
  }

  async function logout() {
    try { await sb().auth.signOut(); } catch (e) { console.error('[auth.logout]', e); }
    sessionUser = null;
  }

  return { init, user, isLogged, login, logout };
})();
