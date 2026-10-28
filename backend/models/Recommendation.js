const db = require('../database');

/*
 * SISTEMA DE RECOMENDAÇÃO (híbrido) — tudo calculado dentro do Neo4j
 *
 * Para cada filme que o usuário AINDA NÃO assistiu nem avaliou, o score é:
 *
 *   score = 2 × colaborativo + conteúdo + 0.3 × popularidade
 *
 *  - colaborativo: procura "vizinhos" = usuários que avaliaram os mesmos filmes que você.
 *      similaridade(vizinho) = (nº de avaliações iguais) − (nº de avaliações opostas)
 *      Só entram vizinhos com similaridade > 0. Se o vizinho deu LIKE no candidato soma a
 *      similaridade dele; se deu DISLIKE, subtrai.
 *  - conteúdo: seu perfil de gêneros. Cada filme que você curtiu soma +2 aos gêneros dele,
 *      cada dislike −2, e cada filme só assistido +0.5. O candidato recebe a soma dos pesos
 *      dos seus gêneros.
 *  - popularidade: likes − dislikes de todo mundo (resolve o "cold start" de usuário novo).
 */
const RECOMMENDATION_QUERY = `
MATCH (u:User {id: $userId})

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
LIMIT $limit
`;

function explain(row) {
    if (row.colaborativo > 0 && row.colaborativo * 2 >= row.conteudo) {
        return 'Usuários com gosto parecido com o seu curtiram';
    }
    if (row.generosQueCurte.length > 0) {
        return `Porque você curte ${row.generosQueCurte.join(' e ')}`;
    }
    return 'Em alta no PseudoFlix';
}

class Recommendation {
    static async forUser(userId, limit = 12) {
        const exists = await db.run('MATCH (u:User {id: $userId}) RETURN u.id', { userId });
        if (exists.records.length === 0) throw new Error('Usuário não encontrado.');

        const result = await db.run(RECOMMENDATION_QUERY, { userId, limit: db.neo4j.int(limit) });
        return result.records.map(rec => {
            const row = rec.toObject();
            return {
                ...row.movie,
                score: Math.round(row.score * 100) / 100,
                reason: explain(row),
                details: {
                    colaborativo: row.colaborativo,
                    conteudo: row.conteudo,
                    popularidade: row.popularidade
                }
            };
        });
    }

    // Usuários mais parecidos com você (útil para mostrar o grafo em apresentação)
    static async similarUsers(userId, limit = 5) {
        const result = await db.run(`
            MATCH (u:User {id: $userId})-[r1:LIKED|DISLIKED]->(m:Movie)<-[r2:LIKED|DISLIKED]-(outro:User)
            WITH outro,
                 sum(CASE WHEN type(r1) = type(r2) THEN 1 ELSE -1 END) AS similaridade,
                 collect(CASE WHEN type(r1) = type(r2) THEN m.title END) AS emComum
            WHERE similaridade > 0
            RETURN outro { .id, .username } AS user, similaridade, emComum[0..5] AS emComum
            ORDER BY similaridade DESC
            LIMIT $limit
        `, { userId, limit: db.neo4j.int(limit) });
        return result.records.map(r => r.toObject());
    }
}

Recommendation.QUERY = RECOMMENDATION_QUERY;
module.exports = Recommendation;
