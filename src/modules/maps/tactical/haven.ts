// Haven, com três sites. Posições lidas do minimapa público (imagem de 1024 px), partindo dos
// contornos que o gerador detectou. Alturas estimadas.
import { ATTACKER_TINT, barrier, cover, crate, DEFENDER_TINT, doorLeaf, entrance, HEIGHT, polygonRing, ramp, solid, zone } from './builders';
import type { TacticalLayout } from './types';

export const HAVEN_LAYOUT: TacticalLayout = {
  mapId: '2bee0dc9-4ffe-519b-1cbd-7fbe763a6047',
  name: 'Haven',
  wallHeightM: 6.5,
  solids: [
    // Site A: caixa do canto, caixa longa inclinada e borda do lado alto.
    crate(336, 88, 351, 103),
    solid('crate', polygonRing(381, 150, 398, 147, 413, 206, 396, 210), 1.6),
    barrier(334, 106, 336.5, 186),
    solid('structure', polygonRing(266, 119, 300, 119, 300, 158, 266, 158), 3),
    // Entorno do A: ligação, esgoto e A Longo.
    crate(275, 204, 287, 217),
    crate(457, 157, 488, 189, HEIGHT.tallCrate),
    crate(458, 236, 471, 249),
    crate(591, 158, 612, 179),
    crate(658, 272, 681, 284),
    crate(331, 334, 355, 349),
    crate(458, 410, 474, 426),
    crate(458, 434, 480, 451, HEIGHT.tallCrate),
    crate(643, 410, 659, 432),
    crate(677, 349, 692, 365),
    // Site B: caixa central com recorte e coberturas do salão.
    solid('structure', polygonRing(381, 473, 419, 473, 419, 496, 435, 496, 435, 525, 419, 525, 419, 549, 381, 549), 2.2),
    cover(281, 480, 290, 542, 1.2),
    cover(323, 496, 328, 526, 1.1),
    cover(411, 572, 480, 587, 1),
    // Meio: pátio, janela e garagem.
    crate(582, 480, 597, 496),
    cover(643, 487, 671, 547, 1),
    crate(665, 580, 689, 612, HEIGHT.tallCrate),
    crate(509, 603, 523, 620),
    cover(442, 625, 462, 667, 1.2),
    crate(626, 664, 643, 688, HEIGHT.tallCrate),
    crate(735, 625, 752, 649),
    crate(797, 473, 812, 488),
    // Portas da garagem: as duas folhas desenhadas no minimapa.
    doorLeaf(564, 629, 573, 643),
    doorLeaf(552, 648, 561, 663),
    // Site C: caixas grandes da borda e caixa do canto.
    crate(396, 788, 428, 850, HEIGHT.tallCrate),
    crate(366, 895, 428, 942, HEIGHT.tallCrate),
    crate(320, 857, 335, 874),
    // Entorno do C: ligação, nicho e C Longo.
    crate(281, 772, 297, 788),
    cover(381, 742, 427, 757, 1.4),
    crate(505, 811, 520, 827),
    cover(589, 826, 628, 842, 1.2),
    crate(681, 757, 698, 780, HEIGHT.tallCrate),
    crate(681, 803, 693, 815),
    crate(766, 696, 781, 710),
  ],
  ramps: [
    // Lado alto do A, descendo para a ligação.
    ramp(220, 165, 262, 300, [241, 300], [241, 168]),
  ],
  entrances: [
    entrance('A', 335, 203, 435, 203),
    entrance('A', 475, 120, 475, 155),
    entrance('B', 390, 432, 420, 432),
    entrance('B', 481, 503, 481, 535),
    entrance('B', 350, 590, 390, 590),
    entrance('C', 318, 788, 396, 788),
    entrance('C', 428, 800, 428, 895),
  ],
  zones: [zone(37, 355, 145, 470, DEFENDER_TINT, 0.22), zone(872, 432, 990, 650, ATTACKER_TINT, 0.2)],
};
