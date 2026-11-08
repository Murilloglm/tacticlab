# Roadmap do TacticLab

Um item só aparece como concluído depois de testado. "Testado" indica como: **unit** (Vitest), **e2e** (Playwright no Chromium, sobre o build de produção) ou **SQL** (migração real em um Postgres, simulando cada usuário).

## Falta para o site estar no ar

| Item | Situação | O que é preciso |
| --- | --- | --- |
| Salas online e contas | **Código pronto, nunca executado contra um projeto real** | Criar um projeto Supabase e fazer um teste com duas pessoas. |

O site é publicado no GitHub Pages pelo workflow a cada push na `main`, depois de passar pelos testes.

## Refatoração do 3D

O que mudou, em ordem de entrega. Os itens marcados como "visual" foram conferidos em capturas de tela no WebGL por software, não em GPU real.

### Implementado

- [x] **Habilidades com preset fixo:** tamanho, duração e percurso vêm de `abilities/definitions.ts`. A instância guarda só posição, direção, trajetória e instante. Os editores de raio, espessura e tempo saíram do painel, do mapa e da timeline (unit, e2e)
- [x] **Migração automática:** estratégias salvas na versão 1 abrem normalmente, e o tamanho salvo nelas é ignorado. Vale para arquivo, link, banco, histórico e salas (unit, e2e)
- [x] **Separação por responsabilidade:** definição (`definitions.ts`), instância (`strategy/schema.ts`), render 2D (`Utility2D.tsx`), render 3D (`viewer3d/abilities/`) e timeline (`abilities/timeline.ts`) (unit)
- [x] **Agentes como bonecos 3D:** com cor da equipe, nome, retrato pequeno, direção e destaque ao selecionar. Registro em `viewer3d/agents/agentModels.ts` aceita modelo próprio por agente (unit, e2e, visual)
- [x] **Sincronização 2D/3D:** o boneco usa a mesma simulação do 2D, conferida pela posição no grafo da cena (e2e)
- [x] **Mapa piloto (Ascent):** layout tático com 59 coberturas de 6 tipos, 6 rampas, massas construídas sólidas e zonas de surgimento. Fica em um pedaço próprio do build, baixado só ao abrir o mapa (unit, e2e, visual)
- [x] **Renderizadores 3D por categoria:** volumes de smoke, paredes em blocos e de energia, áreas no chão com borda, projéteis em arco, criaturas, dispositivos e rastros (unit, e2e, visual)
- [x] **Exemplos prioritários:** lobo da Skye, smokes de Omen, Brimstone e Astra, parede da Sage, flecha do Sova, robô e torreta da Killjoy, Wingman do Gekko (unit, e2e). Lobo, criatura, drone, torreta, robô, parede e smoke também foram conferidos visualmente; a flecha só de longe
- [x] **Timeline no 3D:** abertura da smoke, avanço de criaturas e projéteis e desaparecimento ao fim do preset (e2e)
- [x] **Inventário da cena:** o que está no grafo 3D fica disponível para testes e como resumo para leitores de tela (e2e)
- [x] **Celular:** bonecos, habilidades e cenário abrem sem erros na emulação (e2e)

### Parcial

- **Presets com valores aproximados:** substituído pela tabela de calibração da segunda etapa, abaixo.
- **Modelos genéricos:** há um único boneco e 10 modelos de habilidade, compartilhados por tipo. Um dispositivo sem modelo próprio aparece como um disco ou sensor genérico.
- **Layout do piloto:** posições lidas do minimapa, com alturas de cobertura estimadas. Precisa de revisão por alguém que conheça o mapa. Paredes internas, andares sobrepostos e portas com estado aberto ou fechado não são representados.
- **Agentes sobre coberturas:** o piso continua sendo um campo de alturas. Um agente não sobe em uma caixa, e projéteis e câmera não colidem com o cenário.
- **Desempenho real:** há limites de polígonos nos testes, mas a taxa de quadros não foi medida em GPU nem em celular de verdade.

### Limite de escopo

O TacticLab é uma prancheta tática, não uma recriação do jogo. O cenário é um esquema de leitura tática derivado do minimapa público, no visual do próprio TacticLab: não usa arte, texturas, modelos ou arquitetura do jogo, e os bonecos e criaturas são formas genéricas, sem imitar personagens. Melhorias futuras seguem esse critério.

### A expandir

- [x] **Bind e Haven:** feitos na segunda etapa, abaixo.
- [ ] **Massas construídas em todos os mapas:** `buildVoidCaps` já é genérico, mas só roda em mapas com layout.
- [ ] **Outros agentes:** revisar os presets individuais e dar modelos próprios onde a forma genérica não identifica a habilidade.
- [ ] **Coberturas nas regras:** usar os sólidos do layout para linha de visão e para bloquear smokes e trajetórias.

## Refinamento visual e calibração (segunda etapa)

Os números das habilidades marcados como "wiki" vêm do wiki oficial (wiki.playvalorant.com), consultado em 2026-11-07, versão PC. Cada página indica a versão do jogo de cada valor. O jogo muda com os patches, então a tabela registra a página usada em cada linha.

### Refinado

- [x] **Tabela de calibração** em `abilities/calibration.ts`: categoria, agente, habilidade, escala no 2D e no 3D, altura, largura, raio, deslocamentos, duração, velocidade, arco e modelo. Cada linha diz a origem dos números e quais campos são estimativas (unit)
- [x] **Smokes de referência:** Astra 4,75 m (14,25 s), Omen 4,1 m (15 s) e Brimstone 4,15 m (19,25 s), todas com a mesma proporção de altura e cor própria. A da Astra é a maior das três (unit, e2e)
- [x] **Causa da "smoke pequena":** a smoke abria em 600 ms a partir de 35% do tamanho, e quem posicionava no instante atual a via sempre pela metade. Agora a abertura só acontece durante a reprodução (unit, e2e)
- [x] **Escala geral:** as smokes ficaram mais baixas, porque a altura caiu de cerca de 1,6 vez o raio para no máximo 1,3. A ultimate da Viper passou de 20 m para 9 m. Dispositivos e criaturas crescem no máximo 2,2 vezes na visão aérea, contra até 6 vezes antes. A borda das áreas no chão baixou de 0,7 m para 0,3 m. Um teste confere os limites de todas as habilidades do catálogo (unit)
- [x] **Trajetórias por velocidade:** lobo da Skye a 8 m/s até 6 s, Wingman a 6,3 m/s até 5 s e flecha do Sova a 40 m/s. O percurso depende do comprimento do caminho desenhado (unit, e2e)
- [x] **Paredes do wiki:** parede da Sage com 4 blocos e 10,4 m; Viper com 60 × 4 m; Harbor com 60 × 8 m; Neon com duas paredes paralelas de 46,5 m, separadas por 3,5 m; Deadlock com duas paredes cruzadas de 10 m (unit, visual)
- [x] **Modelos e efeitos:** smokes em volume facetado com núcleo; parede da Sage em blocos de gelo; lobo em corrida; Wingman com olho grande; torreta com cone de 100° no chão; robô de alarme com raio de 5,5 m; recon com área de 30 m e dois pulsos depois de cravar; criaturas com o alcance de visão; áreas no chão com borda e anel interno. O 2D mostra os mesmos cones, raios e cores (unit, e2e, visual)
- [x] **Ascent:** paredes de 6,5 m, escada em degraus da plataforma do site A, que também corrige um afundamento falso no campo de alturas, e seis entradas de bombsite marcadas no piso. Também removi a mureta errada na lateral elevada do B, que é um desnível aberto para o site (unit, e2e, visual)
- [x] **Bind:** 28 coberturas, 4 rampas, sendo uma escada, 6 entradas, plataformas dos teleportadores e zonas de surgimento. A linha do caminho dos teleportadores, que o gerador lia como parede e piso, foi removida (unit, e2e, visual)
- [x] **Haven:** 38 coberturas, incluindo a caixa central do B e as duas portas da garagem, uma rampa, 7 entradas nos três sites e zonas de surgimento (unit, e2e, visual)

### Ainda aproximado

- **Valores estimados nas linhas do wiki:** a altura visível das smokes, que o wiki não informa; a altura e a espessura da parede da Sage, já que a página diz "10,4 × 1,5 m" sem dizer qual medida é a altura e o TacticLab usa 3,6 m de altura; o comprimento do Blaze, de até 21 m; a duração da Poison Cloud e da Toxic Screen, que dependem do combustível; o raio da Slow Orb e do Hot Hands; e a velocidade do lobo, da flecha e do drone.
- **Habilidades só com o padrão da categoria:** 41 linhas cobrem 17 agentes. As demais habilidades dos 30 agentes usam padrões estimados por categoria, sem fonte. O teste de escala impede que fiquem exageradas, mas não garante o número do jogo.
- **Trapwire:** o fio vai de parede a parede no jogo, até 15 m. Sem colisão na cena, o preset usa 7 m, uma passagem típica.
- **Torreta:** o wiki não informa um alcance de detecção em metros. O cone usa as faixas de dano de 20 m e 35 m.
- **Layouts:** posições lidas do minimapa, alturas de cobertura estimadas e entradas interpretadas a partir dos desenhos. O minimapa não mostra andares sobrepostos.

### Precisa de revisão

- **Por quem conhece os mapas:** as entradas do Bind e do Haven, a lateral elevada do site B do Ascent, as alturas das caixas e as rampas sem gradiente claro no minimapa.
- **Habilidades sem linha na tabela:** priorizar Raze, Fade, KAY/O, Breach, Chamber, Yoru, Iso, Vyse, Tejo, Waylay e Miks, nessa ordem, conferindo cada uma no wiki oficial.
- **Próximos mapas:** Split, Lotus e Sunset. O padrão é o mesmo: arquivo em `maps/tactical/`, registro em `maps/tactical/index.ts`, `wallExclusions` para marcas do minimapa que o gerador lê como parede e um teste próprio herdado de `tests/scenario.test.ts`.

## Estrutura do terreno e ancoragem (terceira etapa)

### Terreno estruturado

Nos mapas com layout (Ascent, Bind e Haven), o piso deixou de ser um relevo suave. O campo gerado vem do tom do minimapa, desfocado, e por isso toda mudança de nível virava um "morro". Agora cada parte do piso tem um tipo:

- [x] **Piso elevado e platôs:** blocos retos de altura única com bordas verticais. Diferenças de até 0,6 m entre platôs vizinhos viram um chanfro de uma célula, porque vêm da tinta do minimapa e não de estrutura do mapa. Acima disso, a borda é vertical e nítida (unit, e2e, visual)
- [x] **Escadas:** degraus individuais de cerca de 0,28 m, com piso plano em cada degrau e espelho vertical, ocupando a escada inteira. A da torre do A no Bind desce 4,4 m em 16 degraus; a da plataforma do site A no Ascent tem 9 degraus (unit, visual)
- [x] **Rampas:** inclinação linear, emendada sem degrau nos platôs das duas pontas (unit)
- [x] **Coberturas:** continuam como blocos retos sobre o piso do platô onde estão
- [x] **Bombsites:** sempre pisos planos. No Ascent, o miolo do site B tinha um "losango" de altura falsa vindo da cor do site no minimapa (unit)
- [x] A altura usada por agentes, habilidades e câmera é exatamente a superfície desenhada, e as paredes descem até o piso mais baixo em volta, sem fresta junto a desníveis (unit)
- [x] Correção: a "escada do Jardim para a Árvore" do Ascent tinha 0,2 m de desnível e era um erro meu de leitura; saiu do layout. A entrada do site A que ficava sobre a escada foi para o pé dela

Os outros mapas continuam com o relevo gerado, sem mudança.

### Ancoragem das habilidades

Cada habilidade tem agora um tipo de ancoragem: no chão, em parede, projétil, objeto colocado, percurso, presa em superfície ou fio entre paredes. Os números novos vêm do wiki oficial (wiki.playvalorant.com, consultado em 2026-11-07).

Passaram a ter ancoragem correta:

- [x] **Breach, Aftershock:** carga presa na face da parede. Atravessa até 10 m de parede, e o cilindro de 10 m por 3 m de raio aparece do outro lado. O editor só aceita com parede a até 3 m do clique, parede atravessável nessa direção e o Breach a até 35 m. Estratégias antigas, em que ela era um círculo no chão, caem na parede mais próxima (unit, e2e, visual)
- [x] **Breach, Flashpoint:** carga na parede, com o clarão estourando do outro lado (unit, e2e)
- [x] **Breach, Fault Line:** faixa de 8 m de largura que começa 8 m à frente do Breach; o alvo define o comprimento, de 8 m a 56 m (unit, e2e)
- [x] **Breach, Rolling Thunder:** faixa de 32 m por 18 m, 8 m à frente dele. O wiki confirma que é faixa, e não cone (unit)
- [x] **Sova, Fúria do Caçador:** feixe de 66 m por 3,5 m a partir dele (unit)
- [x] **Fade, Nightfall:** onda de 40 m por 20 m à frente dela (unit)
- [x] **Cypher, fio:** liga as duas paredes da passagem clicada, até 15 m. Se a passagem for mais larga, o fio fica tracejado (unit, e2e)
- [x] **Cypher, câmera; Deadlock, Sonic Sensor; Vyse, Arc Rose:** presos na parede, na altura indicada, olhando para fora. A câmera mostra o campo de visão, o sensor a área de 9 × 8 m e a Arc Rose o alcance de 10 m (unit, e2e)
- [x] Mover uma habilidade presa mantém ela na parede. O painel mostra a ancoragem e as dicas do editor explicam como posicionar cada tipo (unit, e2e)

Já estavam coerentes e só ganharam o tipo explícito: smokes e áreas no chão, torreta e robô do Killjoy (objetos colocados), flechas e drone do Sova (projéteis), lobo e Wingman (percurso).

### Ainda aproximado

- A máscara de piso trata caixas recortadas do minimapa como parede, então uma carga do Breach pode "atravessar" uma caixa.
- Flashpoint: o wiki não informa o raio do clarão nem a distância em que ele estoura depois da parede; o TacticLab usa 3 m e um marcador de 1 m.
- Câmera do Cypher: o wiki fala em giro de meio hemisfério, sem alcance; o campo de visão usa 12 m, o raio de detecção da câmera ativa.
- Alturas de montagem na parede (2,6 m, 1,2 m e 1,5 m) são estimativas, dentro do limite de 4,5 m do wiki.
- Rampas que o minimapa não deixa claras viram platôs com borda. A rampa da janela do B no Bind ficou como uma inclinação leve entre os dois platôs vizinhos; o campo original sugere um desnível maior que não consegui confirmar.

### Precisa de revisão

- **Habilidades com lógica parecida, ainda genéricas:** Yoru, Blindside, e Phoenix, Curveball, que rebatem ou contornam paredes; KAY/O, ZERO/point, que fica presa numa superfície; Raze, Boom Bot, e Neon, Relay Bolt, que quicam; Fade, Haunt; Deadlock, GravNet; Chamber, Trademark; Viper, Toxic Screen, que liga emissores; Harbor, Cascade.
- **Terreno:** conferir no jogo as bordas que viraram chanfro no Haven, onde os desníveis são pequenos, e as plataformas declaradas que ainda faltam (`platforms` no layout).

## Concluído

### Fase 1: base

- [x] Catálogo de 18 mapas e 30 agentes, com cache e reserva offline (unit, e2e)
- [x] Zoom com scroll, mover a visão e pinça no celular (e2e)
- [x] Posicionar, mover e girar agentes, até 5 por equipe (unit, e2e)
- [x] Linha, seta, mão livre, marcação, texto e área (unit, e2e)
- [x] Selecionar, duplicar, excluir, desfazer e refazer (unit, e2e)
- [x] Salvamento local automático, inclusive ao recarregar logo após editar (unit, e2e)

### Fase 2: 3D

- [x] Geometria própria para cada mapa, identificada como aproximada (unit, e2e)
- [x] Alternância 2D/3D sem perda de dados, com a mesma posição nos dois modos (unit, e2e)
- [x] Mover e posicionar agentes no 3D (e2e)
- [x] Câmera aérea com rotação e zoom, visão padrão e foco em agente (e2e)
- [x] Câmera fantasma: WASD, mouse, Espaço, Ctrl, Shift, V e velocidade ajustável, sem colisão nem gravidade (unit, e2e)
- [x] Joystick, área de olhar e botões de altura no toque (e2e, em emulação)

### Fase 3: habilidades

- [x] Nome, descrição e ícone vindos da Valorant-API (unit, e2e com a API real)
- [x] Classificação de todas as habilidades ativas dos 30 agentes atuais (unit)
- [x] Áreas, paredes, trajetórias e marcadores nos dois modos, com presets fixos (unit, e2e)
- [x] Aviso de que tamanhos e tempos são aproximações, não dados oficiais (e2e)

### Fase 4: simulação

- [x] Rotas com pontos, destino, velocidade, pausas e direção (unit, e2e)
- [x] Simulação determinística em qualquer ordem de tempo (unit, e2e)
- [x] Play, pause, reiniciar, avançar, retroceder e velocidade (unit, e2e)
- [x] Arrastar rotas, habilidades, notas e keyframes na timeline (e2e)
- [x] Keyframes e lista cronológica de eventos (unit, e2e)
- [x] Reprodução no 2D e no 3D (e2e)

### Fase 5: persistência

- [x] Criar, renomear, duplicar e excluir estratégias, com filtros por mapa e lado (unit, e2e)
- [x] Pastas (unit, e2e)
- [x] Importar e exportar JSON, com validação e erros claros (unit, e2e)
- [x] Exportar PNG no 2D e no 3D, inclusive com imagens reais (e2e)
- [x] Link de compartilhamento que carrega a estratégia (unit, e2e)
- [x] Histórico de versões com restauração (unit, e2e)
- [x] Biblioteca de lineups, sem status "oficial" (unit, e2e)
- [x] Regra de sincronização com a conta (unit). A conversa com o servidor **não foi executada**.

### Fase 6: colaboração

- [x] Motor de sincronização: conflitos, trabalho offline e reconexão (unit, com transporte simulado)
- [x] Salas, convites, participantes, papéis e edição simultânea (e2e, entre abas, pelo transporte local)
- [x] Regras de acesso RLS, incluindo os canais do Realtime (SQL)
- [x] Nenhuma chave privada no site (unit)

### Fase 8: publicação

- [x] Build estático, rotas por hash e subcaminho `/tacticlab/` (e2e)
- [x] Workflow em uso: testes, build e publicação a cada push na `main`

## Pendências conhecidas

### Precisa de validação externa

- **Supabase real:** cadastro, login, canais privados do Realtime, presença e sincronização nunca rodaram contra um projeto. O transporte `SupabaseTransport.ts` só tem testes dos nomes de canais e dos estados de conexão. Espere possíveis ajustes.
- **Outros navegadores:** só o Chromium foi testado. Faltam Firefox e Safari, em especial a captura do mouse e os gestos de toque.
- **Celulares de verdade:** os testes usam emulação. Desempenho e conforto dos joysticks ainda não foram medidos em aparelho real.
- **Desempenho com GPU:** os testes usam WebGL por software, então não medem a taxa de quadros real.

### Limitações da geometria 3D

- Alturas são estimativas. O teto de cada parede é padronizado, e não há andares sobrepostos, porque o minimapa só mostra a vista de cima.
- Portas aparecem como aberturas nas paredes, sem estado aberto ou fechado. No mapa piloto, a folha da porta é um objeto fixo. Elementos móveis de cada mapa não são representados.
- Nos mapas sem layout tático, contornos internos viram muretas baixas, mesmo quando são outra coisa no jogo. A correção é criar o layout do mapa em `maps/tactical/`, como no Ascent, ou ajustar `scripts/map-overrides`.
- Pearl: os nomes de locais da API não coincidem com a imagem. O mapa é marcado como não confiável, os nomes ficam aproximados e as alturas usam só o minimapa. Sunset, Breeze e Lotus recebem um ajuste automático de posição que merece conferência visual.
- District, Kasbah, Drift, Glitch e Piazza não têm escala publicada: as medidas em metros são estimadas e esses mapas não têm nomes de locais.

### Funcionalidades a fazer

- [ ] Remover participantes e trocar o convite pela interface. O banco já suporta, mas não há botões.
- [ ] Ver uma lineup da biblioteca sobre a prancha da estratégia.
- [ ] Sincronizar imagens de lineups com a conta. Hoje ficam só no navegador.
- [ ] Seleção por área e edição em grupo.
- [ ] Mesma estratégia aberta em duas abas fora de uma sala: hoje vale o último salvamento.
- [ ] Validação do conteúdo das alterações no servidor. As regras de acesso limitam quem publica, e cada cliente valida o que recebe, mas o servidor não inspeciona o conteúdo.
- [ ] Acessibilidade do mapa por teclado. Os painéis têm rótulos e foco visível, mas o canvas depende de ponteiro.

### Atalho do navegador

Ctrl+W fecha a aba, e o navegador não permite bloquear isso. Na câmera fantasma, a tecla C também desce, para evitar o acidente ao segurar Ctrl e apertar W.
