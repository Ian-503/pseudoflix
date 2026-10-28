# PseudoFlix 🎬

Mini Netflix com **Node.js + Express + Neo4j**. Os usuários podem **assistir**, dar **like** ou **dislike**
nos filmes, e o Neo4j usa esse grafo para gerar **recomendações personalizadas**.

Os filmes vêm da **API pública do Internet Archive** (coleção `feature_films`), então são todos de
**domínio público** e têm vídeo de verdade para assistir.

## Modelo do grafo

```
(:User {id, username, email, password})
(:Movie {id, title, year, synopsis, director, runtime, posterUrl, videoUrl, pageUrl})
(:Genre {name})

(:User)-[:WATCHED {at, times}]->(:Movie)
(:User)-[:LIKED {at}]->(:Movie)
(:User)-[:DISLIKED {at}]->(:Movie)
(:Movie)-[:IN_GENRE]->(:Genre)
```

## Como rodar

**Pré-requisitos:** Node.js 18+ e um Neo4j 5 rodando (Neo4j Desktop, Docker ou Neo4j Aura).

```bash
cd backend
npm install
cp .env.example .env        # no Windows: copy .env.example .env
# edite o .env com a URI, usuário e senha do seu Neo4j

npm run seed                # 50 filmes da API + 10 usuários com likes/dislikes/assistidos
npm start                   # http://localhost:3000
```

Abra **http://localhost:3000** e entre com um usuário de teste:
`ana@pseudoflix.com` / `123456` (também: bruno, carla, diego, elisa, felipe, gabriela, henrique, isabela, joao).

> O front é servido pelo próprio Express, então não precisa de Live Server.

### Docker (se não tiver o Neo4j instalado)

```bash
docker run -d --name neo4j -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/senha12345 -e NEO4J_PLUGINS='["apoc"]' neo4j:5
```
E no `.env`: `NEO4J_PASSWORD=senha12345`.

## Seed direto no Neo4j Browser (alternativa)

Se preferir fazer tudo em Cypher, abra `cypher/01_seed_com_apoc.cypher` no Neo4j Browser e execute
(precisa do plugin **APOC**). Ele chama a mesma API com `apoc.load.json`, cria os 50 filmes, os 10 usuários e os
relacionamentos. Em `cypher/02_consultas_recomendacao.cypher` estão as consultas de recomendação para demonstrar.

## Sistema de recomendação

Arquivo: `backend/models/Recommendation.js`. Tudo é calculado em **uma query Cypher**, só para filmes que o
usuário ainda **não assistiu nem avaliou**:

```
score = 2 × colaborativo + conteúdo + 0.3 × popularidade
```

| Parte | Como funciona |
|---|---|
| **Colaborativo** | Acha "vizinhos": usuários que avaliaram os mesmos filmes. Similaridade = avaliações iguais − avaliações opostas. Se um vizinho deu like no filme, soma a similaridade dele; se deu dislike, subtrai. |
| **Conteúdo (gêneros)** | Monta o perfil do usuário: cada like soma +2 aos gêneros do filme, cada dislike −2, cada filme só assistido +0.5. O candidato ganha a soma dos pesos dos seus gêneros. |
| **Popularidade** | Likes − dislikes de todo mundo. Resolve o "cold start" de usuário recém-cadastrado. |

Cada recomendação volta com um motivo ("Usuários com gosto parecido com o seu curtiram", "Porque você curte Terror"…),
que aparece no card. No modal do filme também há "Quem curtiu este também curtiu" (`Movie.getSimilar`).

## API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Testa a conexão e conta nós |
| POST | `/api/register` | `{username, email, password}` |
| POST | `/api/login` | `{email, password}` (email ou nome de usuário) |
| GET | `/api/users` | Lista usuários |
| GET | `/api/movies` | Todos os filmes (com gêneros, likes, dislikes, views) |
| GET | `/api/movies/popular` | Mais curtidos |
| GET | `/api/movies/:id` | Um filme |
| GET | `/api/movies/:id/similar` | Quem curtiu também curtiu |
| GET | `/api/genres` | Gêneros e quantidade de filmes |
| POST | `/api/rate` | `{userId, movieId, rating: "like" \| "dislike" \| "none"}` |
| POST | `/api/watch` | `{userId, movieId}` — marca como assistido |
| GET | `/api/users/:id/recommendations` | Recomendações |
| GET | `/api/users/:id/history` | Últimos 6 assistidos |
| GET | `/api/users/:id/interactions` | IDs curtidos / não curtidos / assistidos |
| GET | `/api/users/:id/similar-users` | Usuários com gosto parecido |

## Problemas comuns

- **`NEO4J_PASSWORD não definida`** → falta criar o `backend/.env`.
- **`Não foi possível conectar`** → o banco não está iniciado no Neo4j Desktop, ou a URI/senha estão erradas.
- **`Não foi possível buscar filmes na API`** → sem internet ou archive.org fora do ar. Depois do primeiro seed
  bem-sucedido, os filmes ficam salvos em `backend/seed/movies.cache.json` e o seed passa a funcionar offline.
- **Senhas** estão em texto puro para fins didáticos; em produção use `bcrypt`.
