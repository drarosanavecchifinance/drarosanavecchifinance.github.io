// config.js — configuração central do site NatureFace / Academy / Clínica
// -----------------------------------------------------------------------------
// Backend NA NUVEM: Supabase (projeto "Trabalho"), tabelas isoladas com prefixo nf_.
// Dados compartilhados entre computadores; acesso protegido por login + RLS.
// -----------------------------------------------------------------------------

window.NF_CONFIG = {
  USE_SUPABASE: true,
  SUPABASE_URL: 'https://cfbnqvznkmpihojwkgek.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_5td7AAZJ4mx4ozaux4bEUg_9ovVk5_t',

  // Com dados na nuvem, o login é obrigatório (RLS só libera autenticado).
  AUTH_DISABLED: false,

  // Enum fixo dos 3 negócios (bate com a coluna `negocio`).
  NEGOCIOS: {
    naturefac: { id: 'naturefac', nome: 'NatureFace', accent: '#b08d3f', extras: ['estoque'] },
    academy:   { id: 'academy',   nome: 'Academy',    accent: '#c2a24e', extras: ['alunas'] },
    clinica:   { id: 'clinica',   nome: 'Clínica',    accent: '#a88b54', extras: [] },
  },

  DIAS_ENTRE_PARCELAS: 31,

  // Taxas reais da maquininha/gateway (descontam do líquido a receber).
  // Crédito é ESCALONADO pelo nº de parcelas. Editar aqui = fica salvo no sistema.
  TAXAS: {
    pix: 0.99,             // PIX
    debito: 1.46,          // débito à vista
    credito_avista: 2.54,  // crédito 1x
    credito: [             // crédito parcelado, por faixa de parcelas
      { ate: 3, taxa: 3.11 },   // 2x a 3x
      { ate: 6, taxa: 3.11 },   // 4x a 6x
      { ate: 12, taxa: 3.47 },  // 7x a 12x
    ],
  },

  // Taxas específicas por negócio (sobrepõem as TAXAS acima; o que não estiver
  // aqui herda da tabela geral). Academy = maquininha própria, base Visa/Master
  // (Elo/Amex têm taxas um pouco maiores; o sistema não separa por bandeira).
  TAXAS_POR_NEGOCIO: {
    academy: {
      debito: 1.63,          // débito à vista
      credito_avista: 2.47,  // crédito 1x
      credito: [
        { ate: 6, taxa: 2.48 },    // 2x a 6x
        { ate: 12, taxa: 2.49 },   // 7x a 12x
        { ate: 18, taxa: 2.99 },   // 13x a 18x
      ],
    },
  },
};
