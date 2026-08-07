// seed.js — na nuvem (Supabase) só garante as FORMAS DE PAGAMENTO reais uma vez.
// Sem dados de exemplo/fake — o resto (produtos, vendas, alunas...) é cadastrado pelo uso.
const NF3 = window.NF || (window.NF = {});

NF3.seed = async function seed() {
  if (!NF.auth.isLogged()) return;                 // precisa estar logado (RLS)
  const formas = await NF.data.list('formas_pagamento');
  if (formas.length) return;                        // já criadas
  const f = (nome, tipo, taxa_pct, imediato) =>
    NF.data.insert('formas_pagamento', { nome, tipo, taxa_pct, recebimento_imediato: imediato });
  await f('PIX', 'pix', 0, true);
  await f('Dinheiro', 'dinheiro', 0, true);
  await f('Cartão crédito', 'cartao', 3.5, false);
  await f('Cartão débito', 'cartao', 1.5, false);
  await f('Boleto', 'boleto', 0, false);
  console.log('[NatureFace] formas de pagamento criadas.');
};
