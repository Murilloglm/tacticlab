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

- **Presets com valores aproximados:** 17 agentes têm ajustes por habilidade; o restante usa o padrão da categoria. Os números são estimativas para planejamento, sem conferência contra uma fonte oficial. Revisar em `definitions.ts`, o que vale para todas as estratégias de uma vez.
- **Modelos genéricos:** há um único boneco e 10 modelos de habilidade, compartilhados por tipo. Um dispositivo sem modelo próprio aparece como um disco ou sensor genérico.
- **Layout do piloto:** posições lidas do minimapa, com alturas de cobertura estimadas. Precisa de revisão por alguém que conheça o mapa. Paredes internas, andares sobrepostos e portas com estado aberto ou fechado não são representados.
- **Agentes sobre coberturas:** o piso continua sendo um campo de alturas. Um agente não sobe em uma caixa, e projéteis e câmera não colidem com o cenário.
- **Desempenho real:** há limites de polígonos nos testes, mas a taxa de quadros não foi medida em GPU nem em celular de verdade.

### Limite de escopo

O TacticLab é uma prancheta tática, não uma recriação do jogo. O cenário é um esquema de leitura tática derivado do minimapa público, no visual do próprio TacticLab: não usa arte, texturas, modelos ou arquitetura do jogo, e os bonecos e criaturas são formas genéricas, sem imitar personagens. Melhorias futuras seguem esse critério.

### A expandir

- [ ] **Outros mapas:** criar o arquivo em `maps/tactical/` e registrar o UUID em `maps/tactical/index.ts`. Ordem sugerida: Bind, Haven, Split, depois o restante. Os demais usam a geometria gerada, sem alteração.
- [ ] **Massas construídas em todos os mapas:** `buildVoidCaps` já é genérico, mas só roda em mapas com layout.
- [ ] **Outros agentes:** revisar os presets individuais e dar modelos próprios onde a forma genérica não identifica a habilidade.
- [ ] **Coberturas nas regras:** usar os sólidos do layout para linha de visão e para bloquear smokes e trajetórias.

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
