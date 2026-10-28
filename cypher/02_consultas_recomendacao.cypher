// =====================================================================
//  PseudoFlix — consultas para rodar no Neo4j Browser
// =====================================================================

// Escolha o usuário (rode esta linha sozinha primeiro):
:param email => "ana@pseudoflix.com"

// ---------- Recomendações para o usuário (mesma lógica usada pela API) ----------
// score = 2 x colaborativo + conteúdo (gêneros) + 0.3 x popularidade
MATCH (u:User {email: $email})

// 1) Perfil de gêneros do usuário
OPTIONAL MATCH (u)-[r:LIKED|DISLIKED|WATCHED]->(:Movie)-[:IN_GENRE]->(g:Genre)
WITH u, g.name AS genero,
     sum(CASE type(r) WHEN 'LIKED' THEN 2.0 WHEN 'DISLIKED' THEN -2.0 WHEN 'WATCHED' THEN 0.5 ELSE 0.0 END) AS peso
WITH u, collect(CASE WHEN genero IS NOT NULL THEN {genero: genero, peso: peso} END) AS perfil

// 2) Vizinhos: usuários que avaliaram os mesmos filmes (concordou +1, discordou -1)
OPTIONAL MATCH (u)-[r1:LIKED|DISLIKED]->(:Movie)<-[r2:LIKED|DISLIKED]-(outro:User)
WITH u, perfil, outro,
     sum(CASE WHEN type(r1) = type(r2) THEN 1.0 ELSE -1.0 END) AS similaridade
WITH u, perfil,
     collect(CASE WHEN outro IS NOT NULL AND similaridade > 0
                  THEN {id: outro.id, sim: similaridade} END) AS vizinhos

// 3) Candidatos: filmes que o usuário ainda não assistiu nem avaliou
MATCH (m:Movie)
WHERE NOT (u)-[:LIKED|DISLIKED|WATCHED]->(m)
WITH perfil, vizinhos, m,
     [(m)-[:IN_GENRE]->(g:Genre) | g.name]    AS generos,
     [(fa:User)-[:LIKED]->(m) | fa.id]        AS curtiram,
     [(hater:User)-[:DISLIKED]->(m) | hater.id] AS naoCurtiram

// 4) Pontuação
WITH m, generos,
     reduce(s = 0.0, v IN vizinhos |
        s + CASE WHEN v.id IN curtiram THEN v.sim
                 WHEN v.id IN naoCurtiram THEN -v.sim
                 ELSE 0.0 END) AS colaborativo,
     reduce(s = 0.0, p IN perfil |
        s + CASE WHEN p.genero IN generos THEN p.peso ELSE 0.0 END) AS conteudo,
     [p IN perfil WHERE p.genero IN generos AND p.peso > 0 | p.genero] AS generosQueCurte,
     size(curtiram) - size(naoCurtiram) AS popularidade
WITH m, generos, colaborativo, conteudo, generosQueCurte, popularidade,
     colaborativo * 2.0 + conteudo + popularidade * 0.3 AS score
RETURN m { .*, genres: generos } AS movie,
       score, colaborativo, conteudo, popularidade, generosQueCurte
ORDER BY score DESC, popularidade DESC, movie.title
LIMIT 10;

// ---------- Ver o grafo do usuário (filmes avaliados e seus gêneros) ----------
MATCH p = (u:User {email: $email})-[:LIKED|DISLIKED]->(m:Movie)-[:IN_GENRE]->(g:Genre)
RETURN p;

// ---------- Usuários com gosto parecido ----------
MATCH (u:User {email: $email})-[r1:LIKED|DISLIKED]->(m:Movie)<-[r2:LIKED|DISLIKED]-(outro:User)
WITH outro, sum(CASE WHEN type(r1) = type(r2) THEN 1 ELSE -1 END) AS similaridade
WHERE similaridade > 0
RETURN outro.username AS usuario, similaridade
ORDER BY similaridade DESC;

// ---------- Filmes mais curtidos ----------
MATCH (m:Movie)
WITH m, size([(m)<-[:LIKED]-() | 1]) AS likes, size([(m)<-[:DISLIKED]-() | 1]) AS dislikes
RETURN m.title AS filme, likes, dislikes
ORDER BY likes - dislikes DESC
LIMIT 10;
