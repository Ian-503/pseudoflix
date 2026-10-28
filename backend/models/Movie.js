const db = require('../database');

// Projeção padrão de um filme: propriedades + gêneros + contagem de likes/dislikes/views
const MOVIE_PROJECTION = `
    m {
        .*,
        genres: [(m)-[:IN_GENRE]->(g:Genre) | g.name],
        likes: size([(m)<-[:LIKED]-(:User) | 1]),
        dislikes: size([(m)<-[:DISLIKED]-(:User) | 1]),
        views: size([(m)<-[:WATCHED]-(:User) | 1])
    }
`;

class Movie {
    constructor({ id, title, year, synopsis, videoUrl, posterUrl, director, runtime, genres = [] }) {
        Object.assign(this, { id, title, year, synopsis, videoUrl, posterUrl, director, runtime, genres });
    }

    // Salva (ou atualiza) o filme e liga aos seus gêneros
    async save() {
        const result = await db.run(`
            MERGE (m:Movie {id: $id})
            SET m.title = $title, m.year = $year, m.synopsis = $synopsis,
                m.videoUrl = $videoUrl, m.posterUrl = $posterUrl,
                m.director = $director, m.runtime = $runtime
            WITH m
            UNWIND $genres AS genreName
            MERGE (g:Genre {name: genreName})
            MERGE (m)-[:IN_GENRE]->(g)
            RETURN DISTINCT m
        `, { ...this });
        return result.records[0]?.get('m').properties;
    }

    static async getAll() {
        const result = await db.run(`
            MATCH (m:Movie)
            RETURN ${MOVIE_PROJECTION} AS movie
            ORDER BY m.title
        `);
        return result.records.map(r => r.get('movie'));
    }

    static async getById(id) {
        const result = await db.run(`
            MATCH (m:Movie {id: $id})
            RETURN ${MOVIE_PROJECTION} AS movie
        `, { id });
        return result.records[0]?.get('movie') || null;
    }

    static async getGenres() {
        const result = await db.run(`
            MATCH (g:Genre)<-[:IN_GENRE]-(m:Movie)
            RETURN g.name AS name, count(m) AS total
            ORDER BY total DESC
        `);
        return result.records.map(r => ({ name: r.get('name'), total: r.get('total') }));
    }

    // Mais curtidos (saldo de likes - dislikes)
    static async getPopular(limit = 10) {
        const result = await db.run(`
            MATCH (m:Movie)
            WITH m, size([(m)<-[:LIKED]-(:User) | 1]) - size([(m)<-[:DISLIKED]-(:User) | 1]) AS saldo
            ORDER BY saldo DESC, m.title
            LIMIT $limit
            RETURN ${MOVIE_PROJECTION} AS movie
        `, { limit: db.neo4j.int(limit) });
        return result.records.map(r => r.get('movie'));
    }

    // "Quem curtiu este filme também curtiu..." + filmes do mesmo gênero
    static async getSimilar(movieId, limit = 10) {
        const result = await db.run(`
            MATCH (alvo:Movie {id: $movieId})
            MATCH (m:Movie) WHERE m <> alvo
            WITH alvo, m,
                 size([(alvo)<-[:LIKED]-(u:User)-[:LIKED]->(m) | u]) AS coLikes,
                 size([(alvo)-[:IN_GENRE]->(g:Genre)<-[:IN_GENRE]-(m) | g]) AS generosEmComum
            WITH m, coLikes, generosEmComum, coLikes * 2 + generosEmComum AS score
            WHERE score > 0
            RETURN ${MOVIE_PROJECTION} AS movie, coLikes, generosEmComum, score
            ORDER BY score DESC, movie.title
            LIMIT $limit
        `, { movieId, limit: db.neo4j.int(limit) });
        return result.records.map(r => ({
            ...r.get('movie'),
            score: r.get('score'),
            reason: r.get('coLikes') > 0
                ? `${r.get('coLikes')} pessoa(s) que curtiram este também curtiram`
                : 'Mesmo gênero'
        }));
    }
}

module.exports = Movie;
