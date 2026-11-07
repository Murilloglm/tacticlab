# Correções por mapa

A geometria de cada mapa é gerada a partir do minimapa e dos callouts da Valorant-API. Para corrigir um mapa, crie aqui um arquivo com o nome dele em inglês e em minúsculas, como `pearl.json`, e rode `npm run maps:generate`. Os outros mapas não são afetados.

Todos os campos são opcionais:

```json
{
  "calloutOffset": { "dx": -0.03, "dy": -0.07 },
  "cmPerLuminance": 18,
  "flatBase": false,
  "boxMaxArea": 48,
  "assumedMeters": 110,
  "features": [{ "type": "teleporter", "x": 0.5, "y": 0.5 }]
}
```

| Campo | O que faz |
| --- | --- |
| `calloutOffset` | Desloca os nomes de locais, em frações da imagem. Substitui o alinhamento automático. |
| `cmPerLuminance` | Centímetros de altura por nível de cinza acima do piso-base. |
| `flatBase` | `true` ignora as alturas dos callouts e usa só o tom do minimapa. |
| `boxMaxArea` | Área máxima, em m², para uma região contornada ser tratada como caixa e não como piso. |
| `assumedMeters` | Largura estimada da imagem, para mapas sem escala publicada. |
| `features` | Pontos adicionais. Hoje o cenário rotula o tipo `teleporter`. |

Depois de gerar, confira o mapa no modo 3D e rode `npm test`.
