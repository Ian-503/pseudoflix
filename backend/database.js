const path = require('path');
const neo4j = require('neo4j-driver');

// Carrega o .env da pasta backend, mesmo que o comando seja rodado de outra pasta
require('dotenv').config({ path: path.join(__dirname, '.env') });

const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
// Aceita NEO4J_USER ou NEO4J_USERNAME (nome usado no arquivo que o Neo4j Aura baixa)
const USER = process.env.NEO4J_USER || process.env.NEO4J_USERNAME || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD;
const DATABASE = process.env.NEO4J_DATABASE || undefined; // vazio = banco padrão (neo4j)

if (!PASSWORD) {
    console.error('\n[Neo4j] NEO4J_PASSWORD não definida.');
    console.error('        Copie backend/.env.example para backend/.env e preencha a senha do seu banco.\n');
    process.exit(1);
}

const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD), {
    // Devolve números do Neo4j como Number do JS (em vez de objetos Integer)
    disableLosslessIntegers: true
});

function getSession(mode = 'WRITE') {
    return driver.session({
        database: DATABASE,
        defaultAccessMode: mode === 'READ' ? neo4j.session.READ : neo4j.session.WRITE
    });
}

// Executa uma query abrindo e fechando a sessão automaticamente
async function run(query, params = {}) {
    const session = getSession();
    try {
        return await session.run(query, params);
    } finally {
        await session.close();
    }
}

// Testa a conexão e mostra uma mensagem clara se algo estiver errado
async function verifyConnection() {
    try {
        const info = await driver.getServerInfo({ database: DATABASE });
        console.log(`[Neo4j] Conectado em ${URI} (${info.agent})`);
    } catch (err) {
        console.error(`\n[Neo4j] Não foi possível conectar em ${URI}`);
        console.error(`        Motivo: ${err.message}`);
        console.error('        Verifique se o banco está rodando (Neo4j Desktop/Aura/Docker)');
        console.error('        e se NEO4J_URI, NEO4J_USER e NEO4J_PASSWORD no backend/.env estão corretos.\n');
        throw err;
    }
}

// Cria constraints (ids únicos) e índices — pode rodar várias vezes sem problema
async function initSchema() {
    const statements = [
        'CREATE CONSTRAINT movie_id IF NOT EXISTS FOR (m:Movie) REQUIRE m.id IS UNIQUE',
        'CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
        'CREATE CONSTRAINT user_email IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE',
        'CREATE CONSTRAINT genre_name IF NOT EXISTS FOR (g:Genre) REQUIRE g.name IS UNIQUE'
    ];
    for (const s of statements) await run(s);
}

module.exports = {
    neo4j,
    driver,
    getSession,
    run,
    verifyConnection,
    initSchema,
    closeDriver: () => driver.close()
};
