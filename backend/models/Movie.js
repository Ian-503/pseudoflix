const neo4j = require('../database');

class Movie {
    constructor(id, title, genre, synopsis, videoUrl, posterUrl) {
        this.id = id;
        this.title = title;
        this.genre = genre;
        this.synopsis = synopsis;
        this.videoUrl = videoUrl;
        this.posterUrl = posterUrl;
    }

    // Salvar filme no banco
    async save() {
        const session = neo4j.getSession();
        try {
            const query = `
                MERGE (m:Movie {id: $id})
                ON CREATE SET m.title = $title, m.genre = $genre, m.synopsis = $synopsis, m.videoUrl = $videoUrl, m.posterUrl = $posterUrl
                RETURN m
            `;
            const result = await session.run(query, {
                id: this.id,
                title: this.title,
                genre: this.genre,
                synopsis: this.synopsis,
                videoUrl: this.videoUrl,
                posterUrl: this.posterUrl
            });
            return result.records[0].get('m').properties;
        } finally {
            await session.close();
        }
    }

    // Buscar todos os filmes ou filtrar por gênero
    static async getAll() {
        const session = neo4j.getSession();
        try {
            const result = await session.run('MATCH (m:Movie) RETURN m');
            return result.records.map(record => record.get('m').properties);
        } finally {
            await session.close();
        }
    }
}

module.exports = Movie;