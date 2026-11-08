// Mapa piloto. Posições lidas do minimapa público (imagem de 1024 px): as coordenadas abaixo estão
// em pixels dessa imagem. Contornos claros viraram coberturas, faixas com gradiente viraram rampas.
// As alturas de coberturas são estimativas para leitura tática, não medidas do jogo.
import { ATTACKER_TINT, barrier, circleRing, cover, crate, DEFENDER_TINT, door, entrance, HEIGHT, n, partition, ramp, rectRing, solid, zone } from './builders';
import type { TacticalLayout } from './types';

export const ASCENT_LAYOUT: TacticalLayout = {
  mapId: '7eaecc1b-4337-bbf6-6ab9-04b8f06b3319',
  name: 'Ascent',
  wallHeightM: 6.5,
  solids: [
    // Site A: caixas do fundo, pilha central e cobertura longa.
    crate(255, 81, 269, 95),
    crate(275, 81, 290, 95),
    crate(347, 81, 362, 95),
    crate(316, 116, 329.5, 130, HEIGHT.tallCrate),
    crate(312, 130, 325, 143),
    cover(306, 186, 347, 201, 1.5),
    // Entrada do site A, vinda de A Principal: caixas e bordas do desnível.
    crate(411, 81, 441, 94),
    crate(411, 94, 441, 108, HEIGHT.tallCrate),
    barrier(369.5, 81, 371, 134),
    barrier(370, 133, 399, 134.5),
    barrier(369.5, 172, 371, 222),
    barrier(370, 172, 399, 173.5),
    // Jardim e acesso à Árvore.
    crate(290, 272, 299, 282),
    barrier(326, 271, 367, 272.5),
    barrier(326, 308.5, 367, 310),
    crate(261, 336, 276, 351),
    // A Acesso.
    crate(528, 234, 541, 248),
    crate(625, 234, 641, 248),
    crate(633, 248, 641, 255),
    crate(584, 294, 598, 307),
    // Passarela: mureta sobre o Pátio e caixas nas pontas.
    crate(448, 419, 462, 433),
    crate(655, 393, 670, 408),
    crate(656, 459, 670, 472),
    barrier(448, 433, 519, 435),
    barrier(516.5, 433, 520, 472),
    barrier(555, 433, 656, 435),
    barrier(554, 433, 557.5, 472),
    barrier(654, 433, 656.5, 472),
    // Pátio do meio: base central e caixa lateral.
    solid('pillar', circleRing(536, 509, 7.5), 1.3),
    crate(569, 501.5, 582.5, 515.5),
    // Meio Baixo: parede dupla com passagem e caixas dos dois lados.
    partition(441, 451, 445, 494),
    partition(441, 523.5, 445, 565),
    crate(435, 530, 441, 544),
    crate(445, 530, 458, 544),
    crate(427.5, 551.5, 441, 565),
    // Pizza.
    crate(317.5, 444, 325, 451),
    crate(325, 444, 341, 460, HEIGHT.tallCrate),
    // Corredor do lado defensor.
    cover(182, 514, 184, 592, 1),
    // Barco do site B: mureta do tanque e casco.
    cover(242.5, 716, 347.5, 750, 1.5),
    solid('structure', [n(269), n(721), n(278), n(714), n(318.5), n(714), n(318.5), n(729), n(278), n(729)], 2.4),
    // Site B.
    crate(326.5, 750.5, 332.5, 764.5),
    crate(332.5, 750.5, 346.5, 764.5, HEIGHT.tallCrate),
    crate(212.5, 786.5, 226.5, 801.5),
    crate(276.5, 808.5, 290, 822.5),
    crate(292.5, 805.5, 305, 819),
    solid('crate', [n(290.25), n(803.5), n(299.75), n(813), n(290.25), n(822.5), n(280.75), n(813)], HEIGHT.tallCrate),
    // A faixa elevada a leste do site B termina em desnível aberto para o site: não há mureta.
    // B Principal e saguão.
    crate(383.5, 758.5, 398, 772.5),
    crate(398, 758.5, 405.5, 766),
    crate(554, 772.5, 583.5, 799, 1.7),
    // Portas: a folha desenhada no minimapa.
    door(376, 352, 377.8, 366),
    door(499, 568, 500.8, 578),
    solid('door', [n(316), n(878), n(317.5), n(876.8), n(330), n(889.8), n(328.8), n(891)], HEIGHT.door),
    door(476, 48, 477.5, 56),
    // Áreas de surgimento e estrutura do lado atacante.
    crate(792, 334, 808, 350),
    solid('structure', rectRing(834, 368, 854, 394), 3),
    solid('pillar', circleRing(867, 647, 14), 3),
    solid('pillar', circleRing(129, 452, 8), 1.2),
    solid('pillar', circleRing(797, 582, 8), 1.2),
  ],
  ramps: [
    // Do corredor defensor até A Janela.
    ramp(150, 265, 183, 337, [166, 337], [166, 265]),
    // Do topo do meio até a Passarela.
    ramp(656, 355, 703, 405, [680, 355], [680, 405]),
    // Do Pátio até a Passarela.
    ramp(520, 433, 554, 473, [537, 473], [537, 433]),
    // Da plataforma do site A até o piso do site.
    ramp(268, 132, 292, 171, [268, 150], [292, 150], 'stairs'),
    // Lateral elevada do site B.
    ramp(348, 700, 375, 790, [361, 700], [361, 790]),
  ],
  entrances: [
    // A: passagem entre as bordas do lado de A Principal e escada da plataforma.
    entrance('A', 370, 134, 370, 172),
    entrance('A', 285, 132, 285, 171),
    // B: frente, ao lado do barco; desnível da faixa elevada; duas passagens da Casa de Barcos.
    entrance('B', 213, 751, 242, 751),
    entrance('B', 347, 779, 347, 872),
    entrance('B', 240, 874, 254, 874),
    entrance('B', 302, 874, 316, 874),
  ],
  zones: [zone(43, 388, 204, 514, DEFENDER_TINT, 0.22), zone(742, 474, 989, 650, ATTACKER_TINT, 0.2)],
};
