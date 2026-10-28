/*
 * Popula o Neo4j com:
 *   - 50 filmes de domínio público vindos da API do Internet Archive
 *   - 10 usuários com relacionamentos LIKED, DISLIKED e WATCHED
 *
 * Uso (dentro da pasta backend):   npm run seed
 *
 * ATENÇÃO: apaga os nós :Movie, :User e :Genre existentes antes de recriar.
 */
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { fetchPublicDomainMovies } = require('./archive');

const CACHE_FILE = path.join(__dirname, 'movies.cache.json');
const TOTAL_MOVIES = 50;

// Cada usuário tem gêneros favoritos e um gênero que detesta -> gera padrões
// de gosto reais, para o sistema de recomendação ter o que aprender.
const USERS = [
    { username: 'ana',      favoritos: ['Terror', 'Ficção Científica'],      detesta: 'Comédia' },
    { username: 'bruno',    favoritos: ['Ação & Aventura', 'Drama'],          detesta: 'Terror' },
    { username: 'carla',    favoritos: ['Comédia', 'Drama'],                  detesta: 'Terror' },
    { username: 'diego',    favoritos: ['Terror', 'Ação & Aventura'],         detesta: 'Drama' },
    { username: 'elisa',    favoritos: ['Ficção Científica', 'Drama'],        detesta: 'Ação & Aventura' },
    { username: 'felipe',   favoritos: ['Comédia', 'Ação & Aventura'],        detesta: 'Ficção Científica' },
    { username: 'gabriela', favoritos: ['Terror', 'Ficção Científica'],      detesta: 'Drama' },
    { username: 'henrique', favoritos: ['Drama', 'Comédia'],                  detesta: 'Ficção Científica' },
    { username: 'isabela',  favoritos: ['Ação & Aventura', 'Ficção Científica'], detesta: 'Comédia' },
    { username: 'joao',     favoritos: ['Comédia', 'Terror'],                 detesta: 'Ação & Aventura' }
];
const DEFAULT_PASSWORD = '123456';

// Gerador pseudoaleatório com semente -> o seed sempre gera os mesmos dados
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const shuffle = (arr, rnd) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

// Decide o que cada usuário fez com cada filme
function buildInteractions(users, movies) {
    const interactions = [];
    users.forEach((user, idx) => {
        const rnd = mulberry32(1000 + idx);
        const has = (m, g) => m.genres.includes(g);
        const fav = movies.filter(m => user.favoritos.some(g => has(m, g)) && !has(m, user.detesta));
        const hate = movies.filter(m => has(m, user.detesta));
        const other = movies.filter(m => !fav.includes(m) && !hate.includes(m));

        const picked = [
            ...shuffle(fav, rnd).slice(0, 9).map(m => ({ m, kind: 'fav' })),
            ...shuffle(hate, rnd).slice(0, 3).map(m => ({ m, kind: 'hate' })),
            ...shuffle(other, rnd).slice(0, 3).map(m => ({ m, kind: 'other' }))
        ];

        for (const { m, kind } of picked) {
            const p = rnd();
            let rating = null; // null = só assistiu
            if (kind === 'fav') rating = p < 0.75 ? 'LIKED' : p < 0.85 ? 'DISLIKED' : null;
            if (kind === 'hate') rating = p < 0.7 ? 'DISLIKED' : null;
            if (kind === 'other') rating = p < 0.35 ? 'LIKED' : p < 0.6 ? 'DISLIKED' : null;
            interactions.push({
                email: user.email,
                movieId: m.id,
                rating,
                daysAgo: Math.floor(rnd() * 60),   // assistiu nos últimos 60 dias
                times: 1 + Math.floor(rnd() * 3)
            });
        }
    });
    return interactions;
}

async function loadMovies() {
    try {
        console.log('Buscando filmes na API do Internet Archive...');
        const movies = await fetchPublicDomainMovies(TOTAL_MOVIES);
        fs.writeFileSync(CACHE_FILE, JSON.stringify(movies, null, 2));
        return movies;
    } catch (err) {
        if (fs.existsSync(CACHE_FILE)) {
            console.warn(`Falha na API (${err.message}). Usando cache local ${path.basename(CACHE_FILE)}.`);
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        }
        throw new Error(`Não foi possível buscar filmes na API: ${err.message}`);
    }
}

async function main() {
    await db.verifyConnection();
    await db.initSchema();

    const movies = await loadMovies();
    console.log(`${movies.length} filmes obtidos.`);

    console.log('Limpando dados antigos (Movie, User, Genre)...');
    await db.run('MATCH (n) WHERE n:Movie OR n:User OR n:Genre DETACH DELETE n');

    console.log('Criando filmes e gêneros...');
    await db.run(`
        UNWIND $movies AS f
        MERGE (m:Movie {id: f.id})
        SET m.title = f.title, m.year = toInteger(f.year), m.synopsis = f.synopsis,
            m.director = f.director, m.runtime = f.runtime,
            m.posterUrl = f.posterUrl, m.videoUrl = f.videoUrl, m.pageUrl = f.pageUrl,
            m.downloads = toInteger(f.downloads), m.source = 'Internet Archive (domínio público)'
        WITH m, f
        UNWIND f.genres AS genreName
        MERGE (g:Genre {name: genreName})
        MERGE (m)-[:IN_GENRE]->(g)
    `, { movies });

    console.log('Criando 10 usuários...');
    const users = USERS.map(u => ({ ...u, email: `${u.username}@pseudoflix.com`, password: DEFAULT_PASSWORD }));
    await db.run(`
        UNWIND $users AS x
        CREATE (u:User {id: randomUUID(), username: x.username, email: x.email,
                        password: x.password, createdAt: datetime()})
    `, { users });

    console.log('Criando relacionamentos WATCHED / LIKED / DISLIKED...');
    const interactions = buildInteractions(users, movies);
    await db.run(`
        UNWIND $interactions AS i
        MATCH (u:User {email: i.email}), (m:Movie {id: i.movieId})
        MERGE (u)-[w:WATCHED]->(m)
        SET w.at = datetime() - duration({days: toInteger(i.daysAgo)}), w.times = toInteger(i.times)
        FOREACH (_ IN CASE WHEN i.rating = 'LIKED' THEN [1] ELSE [] END |
            MERGE (u)-[l:LIKED]->(m) SET l.at = w.at)
        FOREACH (_ IN CASE WHEN i.rating = 'DISLIKED' THEN [1] ELSE [] END |
            MERGE (u)-[d:DISLIKED]->(m) SET d.at = w.at)
    `, { interactions });

    const summary = await db.run(`
        MATCH (u:User)
        RETURN u.username AS usuario,
               size([(u)-[:WATCHED]->() | 1])  AS assistiu,
               size([(u)-[:LIKED]->() | 1])    AS likes,
               size([(u)-[:DISLIKED]->() | 1]) AS dislikes
        ORDER BY usuario
    `);
    console.table(summary.records.map(r => r.toObject()));
    console.log(`\nPronto! Login de qualquer usuário: <nome>@pseudoflix.com / senha ${DEFAULT_PASSWORD}`);
    console.log('Ex.: ana@pseudoflix.com / 123456');
}

if (require.main === module) {
    main()
        .catch(err => { console.error('\nErro no seed:', err.message); process.exitCode = 1; })
        .finally(() => db.closeDriver());
}

module.exports = { buildInteractions, USERS };
