// =====================================================================
//  PseudoFlix — seed 100% em Cypher (alternativa ao "npm run seed")
//  Cole no Neo4j Browser e execute (precisa do plugin APOC instalado).
//  Neo4j Desktop: no seu banco > Plugins > APOC > Install.
//  ATENÇÃO: apaga Movie/User/Genre existentes.
// =====================================================================

// ---------- 0) Limpeza + constraints ----------
MATCH (n) WHERE n:Movie OR n:User OR n:Genre DETACH DELETE n;
CREATE CONSTRAINT movie_id   IF NOT EXISTS FOR (m:Movie) REQUIRE m.id IS UNIQUE;
CREATE CONSTRAINT user_id    IF NOT EXISTS FOR (u:User)  REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT user_email IF NOT EXISTS FOR (u:User)  REQUIRE u.email IS UNIQUE;
CREATE CONSTRAINT genre_name IF NOT EXISTS FOR (g:Genre) REQUIRE g.name IS UNIQUE;

// ---------- 1) 50 filmes de domínio público via API do Internet Archive ----------
// 5 gêneros x 10 filmes, os mais baixados de cada gênero, sem repetir filme.
WITH 'https://archive.org/advancedsearch.php?output=json&rows=30&sort%5B%5D=downloads+desc'
   + '&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&fl%5B%5D=description'
   + '&fl%5B%5D=creator&fl%5B%5D=runtime&fl%5B%5D=downloads&q=' AS base
UNWIND [
  {genero: 'Terror',            q: 'subject:(horror OR zombie OR zombies OR vampire OR vampires)'},
  {genero: 'Comédia',           q: 'subject:(comedy OR comedies OR slapstick)'},
  {genero: 'Ficção Científica', q: 'subject:("science fiction" OR "sci-fi" OR scifi OR "sci fi")'},
  {genero: 'Ação & Aventura',   q: 'subject:(action OR adventure OR western OR westerns OR war)'},
  {genero: 'Drama',             q: 'subject:(drama OR romance OR "film noir" OR noir)'}
] AS cfg
CALL apoc.load.json(base + apoc.text.urlencode(
       'collection:feature_films AND mediatype:movies AND (' + cfg.q + ')')) YIELD value
UNWIND range(0, size(value.response.docs) - 1) AS rank
WITH cfg.genero AS genero, value.response.docs[rank] AS doc, rank
// se o filme aparece em 2 gêneros, fica no gênero onde está melhor colocado
WITH doc.identifier AS id, collect({genero: genero, doc: doc, rank: rank}) AS hits
WITH reduce(b = head(hits), h IN hits | CASE WHEN h.rank < b.rank THEN h ELSE b END) AS best
WITH best.genero AS genero, best.doc AS doc, best.rank AS rank
ORDER BY rank
WITH genero, collect(doc)[0..10] AS docs
UNWIND docs AS doc
MERGE (m:Movie {id: doc.identifier})
SET m.title     = toString(doc.title),
    m.year      = toInteger(left(toString(doc.year), 4)),
    m.synopsis  = left(trim(apoc.text.regreplace(
                    apoc.text.join([x IN apoc.coll.flatten([doc.description]) WHERE x IS NOT NULL | toString(x)], ' '),
                    '<[^>]*>|\\s+', ' ')), 500),
    m.director  = apoc.text.join([x IN apoc.coll.flatten([doc.creator]) WHERE x IS NOT NULL | toString(x)], ', '),
    m.runtime   = toString(head(apoc.coll.flatten([doc.runtime]))),
    m.downloads = toInteger(doc.downloads),
    m.posterUrl = 'https://archive.org/services/img/' + doc.identifier,
    m.videoUrl  = 'https://archive.org/embed/' + doc.identifier,
    m.pageUrl   = 'https://archive.org/details/' + doc.identifier,
    m.source    = 'Internet Archive (domínio público)'
MERGE (g:Genre {name: genero})
MERGE (m)-[:IN_GENRE]->(g);

// ---------- 2) 10 usuários + WATCHED / LIKED / DISLIKED ----------
// Cada usuário tem 2 gêneros favoritos e 1 que detesta:
//  - assiste 9 filmes dos favoritos (75% like, 10% dislike, resto só assiste)
//  - assiste 3 do gênero que detesta (70% dislike)
//  - assiste 3 aleatórios (35% like, 25% dislike)
UNWIND [
  {username: 'ana',      fav: ['Terror', 'Ficção Científica'],          detesta: 'Comédia'},
  {username: 'bruno',    fav: ['Ação & Aventura', 'Drama'],              detesta: 'Terror'},
  {username: 'carla',    fav: ['Comédia', 'Drama'],                      detesta: 'Terror'},
  {username: 'diego',    fav: ['Terror', 'Ação & Aventura'],             detesta: 'Drama'},
  {username: 'elisa',    fav: ['Ficção Científica', 'Drama'],            detesta: 'Ação & Aventura'},
  {username: 'felipe',   fav: ['Comédia', 'Ação & Aventura'],            detesta: 'Ficção Científica'},
  {username: 'gabriela', fav: ['Terror', 'Ficção Científica'],          detesta: 'Drama'},
  {username: 'henrique', fav: ['Drama', 'Comédia'],                      detesta: 'Ficção Científica'},
  {username: 'isabela',  fav: ['Ação & Aventura', 'Ficção Científica'], detesta: 'Comédia'},
  {username: 'joao',     fav: ['Comédia', 'Terror'],                     detesta: 'Ação & Aventura'}
] AS x
CREATE (u:User {id: randomUUID(), username: x.username, email: x.username + '@pseudoflix.com',
                password: '123456', createdAt: datetime()})
WITH u, x
MATCH (m:Movie)-[:IN_GENRE]->(g:Genre)
WITH u, x, m, collect(g.name) AS gs
WITH u, m, rand() AS sorteio,
     CASE WHEN x.detesta IN gs THEN 'hate'
          WHEN any(f IN x.fav WHERE f IN gs) THEN 'fav'
          ELSE 'other' END AS tipo
ORDER BY sorteio
WITH u, tipo, collect(m) AS filmes
UNWIND filmes[0..(CASE tipo WHEN 'fav' THEN 9 ELSE 3 END)] AS m
WITH u, m, tipo, rand() AS p
MERGE (u)-[w:WATCHED]->(m)
SET w.at = datetime() - duration({days: toInteger(rand() * 60)}),
    w.times = 1 + toInteger(rand() * 3)
WITH u, m, w,
     CASE tipo
       WHEN 'fav'  THEN CASE WHEN p < 0.75 THEN 'LIKED' WHEN p < 0.85 THEN 'DISLIKED' END
       WHEN 'hate' THEN CASE WHEN p < 0.70 THEN 'DISLIKED' END
       ELSE             CASE WHEN p < 0.35 THEN 'LIKED' WHEN p < 0.60 THEN 'DISLIKED' END
     END AS nota
FOREACH (_ IN CASE WHEN nota = 'LIKED'    THEN [1] ELSE [] END | MERGE (u)-[:LIKED {at: w.at}]->(m))
FOREACH (_ IN CASE WHEN nota = 'DISLIKED' THEN [1] ELSE [] END | MERGE (u)-[:DISLIKED {at: w.at}]->(m));

// ---------- 3) Conferir ----------
MATCH (u:User)
RETURN u.username AS usuario, u.email AS email,
       size([(u)-[:WATCHED]->() | 1])  AS assistiu,
       size([(u)-[:LIKED]->() | 1])    AS likes,
       size([(u)-[:DISLIKED]->() | 1]) AS dislikes
ORDER BY usuario;
