# Roadmap do TacticLab

Um item só aparece como concluído depois de testado. "Testado" indica como: **unit** (Vitest), **e2e** (Playwright no Chromium, sobre o build de produção) ou **SQL** (migração real em um Postgres, simulando cada usuário).

## Falta para o site estar no ar

| Item | Situação | O que é preciso |
| --- | --- | --- |
| Publicar e testar a URL real | **Não feito** | Criar o repositório e enviar o código. Veja o README. O workflow nunca rodou no GitHub. |
| Salas online e contas | **Código pronto, nunca executado contra um projeto real** | Criar um projeto Supabase e fazer um teste com duas pessoas. |

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
- [x] Agentes como billboards 2D (e2e, inspeção visual)
- [x] Câmera aérea com rotação e zoom, visão padrão e foco em agente (e2e)
- [x] Câmera fantasma: WASD, mouse, Espaço, Ctrl, Shift, V e velocidade ajustável, sem colisão nem gravidade (unit, e2e)
- [x] Joystick, área de olhar e botões de altura no toque (e2e, em emulação)

### Fase 3: habilidades

- [x] Nome, descrição e ícone vindos da Valorant-API (unit, e2e com a API real)
- [x] Classificação de todas as habilidades ativas dos 30 agentes atuais (unit)
- [x] Áreas, paredes, trajetórias e marcadores nos dois modos, com parâmetros editáveis (unit, e2e)
- [x] Aviso de que tamanhos e tempos não são dados oficiais (e2e)

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
- [x] Workflow escrito. **Ainda não executado.**

## Pendências conhecidas

### Precisa de validação externa

- **Supabase real:** cadastro, login, canais privados do Realtime, presença e sincronização nunca rodaram contra um projeto. O transporte `SupabaseTransport.ts` só tem testes dos nomes de canais e dos estados de conexão. Espere possíveis ajustes.
- **Outros navegadores:** só o Chromium foi testado. Faltam Firefox e Safari, em especial a captura do mouse e os gestos de toque.
- **Celulares de verdade:** os testes usam emulação. Desempenho e conforto dos joysticks ainda não foram medidos em aparelho real.
- **Desempenho com GPU:** os testes usam WebGL por software, então não medem a taxa de quadros real.

### Limitações da geometria 3D

- Alturas são estimativas. O teto de cada parede é padronizado, e não há coberturas nem andares sobrepostos, porque o minimapa só mostra a vista de cima.
- Portas aparecem como aberturas nas paredes, sem estado aberto ou fechado. Elementos móveis de cada mapa não são representados.
- Contornos internos viram muretas baixas, mesmo quando são outra coisa no jogo. Revisar mapa a mapa em `scripts/map-overrides`.
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
