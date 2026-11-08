# TacticLab

Prancheta tática para VALORANT, com mapa em 2D, cenário 3D simplificado, câmera fantasma, habilidades, timeline de execução e salas colaborativas. Funciona no navegador do PC e do celular, sem login, como site estático.

Projeto de fãs, sem vínculo com a Riot Games. Não lê a memória do jogo, não interage com o cliente e não oferece assistência durante partidas.

O que já funciona e o que falta está em [ROADMAP.md](ROADMAP.md).

## Rodar localmente

É preciso ter o [Node.js](https://nodejs.org) 22.12 ou mais recente.

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal, que termina em `/tacticlab/`.

| Comando | Para que serve |
| --- | --- |
| `npm run check` | Tipos, lint, testes unitários e build |
| `npm test` | Testes unitários, de geometria e de segurança (RLS) |
| `npx playwright install chromium` | Baixa o navegador dos testes, uma vez |
| `npm run build && npm run test:e2e` | Testes no navegador, sobre o build de produção |
| `npm run maps:generate` | Atualiza mapas e catálogo a partir da Valorant-API |

Para conferir também a API real, rode `E2E_REAL_API=1 npx playwright test e2e/real-api.spec.ts`.

## Publicar no GitHub Pages

1. Crie no GitHub um repositório chamado `tacticlab`. Com outro nome, o endereço muda, mas o workflow se ajusta sozinho.
2. Em **Settings > Pages > Build and deployment**, escolha **GitHub Actions** como origem.
3. Envie o código para a branch `main`:

   ```bash
   git init -b main
   git add .
   git commit -m "Primeira versão do TacticLab"
   git remote add origin https://github.com/USUARIO/tacticlab.git
   git push -u origin main
   ```

4. Acompanhe a aba **Actions**. O workflow roda todos os testes e só publica se eles passarem.

O site fica em `https://USUARIO.github.io/tacticlab/`.

## Ativar contas e salas online (opcional)

Sem esta etapa, tudo fica salvo no navegador e as salas funcionam apenas entre abas do mesmo navegador.

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. No **SQL Editor**, execute o conteúdo de [`supabase/migrations/0001_tacticlab.sql`](supabase/migrations/0001_tacticlab.sql).
3. Em **Authentication > Providers**, deixe **Email** ativo. Ative também **Anonymous Sign-Ins** para que convidados entrem em salas sem criar conta.
4. Em **Authentication > URL Configuration**, informe `https://USUARIO.github.io/tacticlab/` como Site URL e como Redirect URL.
5. Em **Realtime > Settings**, desative **Allow public access**, para que os canais exijam as regras de acesso da migração.
6. No repositório do GitHub, em **Settings > Secrets and variables > Actions > Variables**, crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, com a URL do projeto e a chave pública.
7. Execute o workflow novamente.

Para testar localmente, copie `.env.example` para `.env.local` e preencha os mesmos valores.

Use somente a chave pública. A chave `service_role` ignora todas as regras de acesso e nunca deve ser colocada no site, porque tudo que começa com `VITE_` vai para o navegador.

## Como o código está organizado

Todo objeto é salvo em coordenadas de mapa, frações de 0 a 1 da imagem do minimapa. O 2D e o 3D só convertem esse mesmo ponto para o próprio espaço, e por isso alternar de modo nunca altera os dados.

As ferramentas ficam em um único controlador (`editor/interaction.ts`): as duas visões informam apenas "ponteiro neste ponto, sobre este objeto". A simulação é uma função pura do documento e do tempo, então qualquer instante pode ser visitado em qualquer ordem com o mesmo resultado.

| Pasta em `src/modules` | Responsabilidade |
| --- | --- |
| `coordinates` | Sistema único de coordenadas |
| `strategy` | Modelo de dados, validação, desfazer e refazer |
| `editor` | Página do editor, painéis e controlador de ferramentas |
| `editor2d` | Prancha em Konva |
| `viewer3d` | Cenário em Three.js, bonecos de agente e renderizadores 3D de habilidades |
| `ghostcam` | Câmera fantasma, aérea e controles de toque |
| `maps` | Carregamento da geometria, campo de alturas e layouts táticos por mapa |
| `catalog` | Agentes e mapas, com cache e reserva offline |
| `abilities` | Classificação, presets canônicos, render 2D e comportamento na timeline das habilidades |
| `timeline` | Simulação, relógio e timeline |
| `persistence` | IndexedDB, diário de emergência, histórico, importação e compartilhamento |
| `library` | Lineups |
| `multiplayer` | Motor de sincronização, transportes e salas |
| `services` | Valorant-API, Supabase e sincronização da conta |

## De onde vêm os dados dos mapas

`scripts/generate-map-data.mjs` gera `public/data/maps/<uuid>.json` a partir do minimapa e dos callouts da Valorant-API:

- **Paredes e caixas:** vêm das áreas transparentes e dos contornos brancos do minimapa.
- **Sites:** vêm das áreas em tom oliva.
- **Escala:** vem dos multiplicadores publicados pela API.
- **Alturas:** são estimadas pelo tom de cinza, que marca estruturas elevadas e rampas, e pelas coordenadas `z` dos callouts.

O resultado é **aproximado** e identificado assim na interface. Não é o modelo do jogo: a altura de paredes e caixas é padronizada, e o cenário não tem colisão real. Para corrigir um mapa, veja [`scripts/map-overrides`](scripts/map-overrides/README.md).

A categoria de cada habilidade (smoke, flash etc.) é uma curadoria própria, em `abilities/taxonomy.ts`. A API não fornece alcance nem duração, então tamanho e tempo são presets fixos do TacticLab, na tabela de calibração `abilities/calibration.ts`, que registra a origem de cada número (wiki oficial ou estimativa): são aproximações, rotuladas como não oficiais, e o usuário ajusta só posição, direção, trajetória e instante. Corrigir um preset vale para todas as estratégias, porque nenhuma guarda cópia dele.

Ascent, Bind e Haven têm layout tático em `maps/tactical/`, com coberturas, portas, escadas, rampas e entradas de bombsite lidas do minimapa. Os outros mapas usam a geometria gerada. Para expandir, crie o arquivo do mapa nessa pasta e registre o UUID em `maps/tactical/index.ts`.

Agentes novos aparecem automaticamente, com as habilidades marcadas como "Não classificada" até entrarem na tabela. Mapas novos aparecem no 2D e precisam de `npm run maps:generate` para ter cenário 3D.

## Direitos

VALORANT, seus mapas, agentes e ícones pertencem à Riot Games. O catálogo e as imagens são servidos pela [Valorant-API](https://valorant-api.com), serviço comunitário não oficial. Antes de divulgar ou monetizar o site, confira a política da Riot para projetos de fãs.
