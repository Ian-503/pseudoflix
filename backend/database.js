const neo4j = require('neo4j-driver');
require('dotenv').config();

// Credenciais do Neo4j (substitua pelas suas ou use arquivo .env)
const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || 'sua_senha_aqui';

const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

module.exports = {
    getSession: () => driver.session(),
    closeDriver: () => driver.close()
};