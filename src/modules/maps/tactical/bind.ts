// Bind. Posições lidas do minimapa público (imagem de 1024 px), partindo dos contornos que o gerador
// detectou e descartando teleportadores, folhas de porta e marcas pequenas. Alturas estimadas.
import { ATTACKER_TINT, barrier, circleRing, cover, crate, DEFENDER_TINT, entrance, HEIGHT, ramp, rectRing, solid, TELEPORTER_TINT, zone } from './builders';
import type { TacticalLayout } from './types';

/** Plataformas dos teleportadores, nos pontos que o gerador registrou. */
const TELEPORTERS: Array<[number, number]> = [
  [559, 433],
  [131, 442],
  [200, 718],
  [974, 527],
  [939, 733],
  [609, 813],
];

export const BIND_LAYOUT: TacticalLayout = {
  mapId: '2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba',
  name: 'Bind',
  wallHeightM: 6.5,
  solids: [
    // Site A: pilha em L, cobertura longa e caixas da borda.
    crate(753, 323, 780, 336, HEIGHT.tallCrate),
    crate(753, 336, 767, 361, HEIGHT.tallCrate),
    cover(677, 334, 728, 351, 1.6),
    cover(825, 360, 833, 382, 2),
    crate(807, 399, 833, 414),
    crate(719, 394, 731, 406),
    barrier(796, 411, 832, 415),
    // Entrada do A pelo lado curto e saguão.
    crate(645, 355, 658, 379, HEIGHT.tallCrate),
    crate(645, 445, 657, 476, HEIGHT.tallCrate),
    crate(700, 517, 737, 537),
    barrier(586, 554, 629, 560),
    barrier(711, 560, 712.5, 589),
    crate(803, 560, 815, 580, HEIGHT.tallCrate),
    crate(766, 675, 779, 695),
    crate(879, 596, 894, 605),
    barrier(844, 596, 879, 597.5),
    // Site B: caixa grande central e caixas em volta.
    crate(268, 279, 311, 302, HEIGHT.tallCrate),
    crate(280, 303, 314, 316),
    crate(310, 267, 325, 281),
    crate(241, 306, 252, 319),
    // Corredores do B, janela e jardim.
    cover(203, 348, 215, 373, 1.6),
    cover(309, 360, 348, 375, 1),
    crate(334, 404, 348, 422),
    crate(300, 484, 315, 500),
    cover(254, 436, 281, 463, 1),
    crate(427, 474, 442, 488),
    crate(331, 657, 344, 669),
    // Fonte do B.
    solid('pillar', circleRing(251, 628, 19), 1.2),
  ],
  ramps: [
    // Escada triangular da torre até o site A.
    ramp(760, 238, 820, 265, [790, 265], [790, 238], 'stairs'),
    // Corredor que sobe para a torre do A.
    ramp(640, 190, 736, 225, [640, 207], [736, 207]),
    // Subida da janela do B.
    ramp(300, 377, 350, 500, [325, 500], [325, 377]),
    // Saída do A, do lado atacante.
    ramp(820, 598, 893, 650, [820, 625], [893, 625]),
  ],
  entrances: [
    entrance('A', 763, 265, 819, 265),
    entrance('A', 774, 413, 796, 413),
    entrance('A', 680, 355, 680, 415),
    entrance('B', 232, 317, 232, 350),
    entrance('B', 300, 372, 350, 372),
    entrance('B', 337, 227, 360, 227),
  ],
  // A linha verde do caminho dos teleportadores, que contorna o mapa por fora, não é parede.
  // O corredor atacante (x 482 a 698), que ela cruza embaixo, mantém as paredes reais.
  wallExclusions: [
    rectRing(84, 425, 110, 830),
    rectRing(84, 425, 145, 460),
    rectRing(84, 800, 482, 826),
    rectRing(698, 800, 1024, 826),
    rectRing(990, 505, 1024, 830),
    rectRing(958, 505, 1024, 546),
  ],
  zones: [
    zone(470, 15, 600, 170, DEFENDER_TINT, 0.22),
    zone(550, 860, 665, 980, ATTACKER_TINT, 0.2),
    ...TELEPORTERS.map(([x, y]) => zone(x - 9, y - 9, x + 9, y + 9, TELEPORTER_TINT, 0.5)),
  ],
};
