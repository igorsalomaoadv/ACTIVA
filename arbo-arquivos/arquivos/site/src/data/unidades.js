// Dados das unidades e das tipologias. Tudo fictício: troque aqui preços, status e textos.
// Um apartamento por andar: 2º ao 20º são o tipo, o 21º é a cobertura.

export const STATUS = {
  disponivel: 'Disponível',
  reservado: 'Reservado',
  vendido: 'Vendido',
};

// status por andar (o que não está aqui é "disponivel")
const STATUS_ANDAR = {
  2: 'vendido', 3: 'vendido', 5: 'reservado', 6: 'vendido', 9: 'vendido', 11: 'reservado',
  13: 'vendido', 16: 'reservado', 18: 'vendido', 20: 'reservado',
};

export const TIPOLOGIAS = {
  tipo: {
    nome: 'Tipo',
    titulo: (andar) => `Apartamento ${andar}1`,
    area: 248,
    suites: 3,
    vagas: 4,
    resumo: 'Tipo · 3 suítes · 248 m²',
    texto:
      'Um apartamento por andar, com a sala voltada para o norte. O living de 14 m de frente se abre inteiro para a varanda gourmet, a cozinha tem ilha de mármore e o home office fica no fundo, longe da rua.',
    numeros: [
      ['248 m²', 'área privativa'],
      ['3', 'suítes'],
      ['4', 'vagas'],
    ],
    corte: { img: '/img/tipo/corte', fundo: '#03070d' },
    // ordem da galeria: a primeira é sempre o living
    comodos: [
      ['living', 'Living e jantar'],
      ['cozinha', 'Cozinha'],
      ['suite_master', 'Suíte master'],
      ['banho_master', 'Banho master'],
      ['home_office', 'Home office'],
      ['varanda', 'Varanda gourmet'],
    ],
  },
  cobertura: {
    nome: 'Cobertura',
    titulo: () => 'Cobertura',
    area: 316,
    suites: 2,
    vagas: 6,
    resumo: 'Cobertura · 316 m²',
    texto:
      'A última laje, recuada da fachada. Planta em L com living de canto envidraçado em duas faces, cozinha em nogueira com ilha de pedra preta e 100 m² de terraço descoberto com piscina de borda de 9 m.',
    numeros: [
      ['316 m²', '216 internos + 100 de terraço'],
      ['2', 'suítes amplas'],
      ['6', 'vagas'],
    ],
    corte: { img: '/img/cobertura/corte', fundo: '#0d141c' },
    comodos: [
      ['living', 'Living de canto'],
      ['terraco', 'Terraço e piscina'],
      ['cozinha', 'Cozinha'],
      ['suite_master', 'Suíte master'],
      ['banho_master', 'Banho master'],
    ],
  },
};

/** "R$ 9,4 mi": o 2º andar parte de 9,4 mi e cada andar acima vale cerca de 1,2% mais */
export const precoTipo = (andar) => 9.4 * 1.012 ** (andar - 2);
const mi = (v) => `R$ ${v.toFixed(1).replace('.', ',')} mi`;

export const ANDARES = {};
for (let andar = 2; andar <= 21; andar++) {
  const tipologia = andar === 21 ? 'cobertura' : 'tipo';
  const status = STATUS_ANDAR[andar] ?? 'disponivel';
  ANDARES[andar] = {
    andar,
    tipologia,
    status,
    preco: tipologia === 'cobertura' ? 'Sob consulta' : mi(precoTipo(andar)),
  };
}

export const ordinal = (n) => `${n}º`;
