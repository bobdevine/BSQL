<div align="center">
    <img src="logo.png" width="40" />
</div>

Contents
--------

- [Introduction](#introduction)
    - [What is BSQL?](#what-is-BSql)
    - [Installing](#installing)

Introduction
------------

### What is BSQL?
BSQL (a working name short for Better Structured Query Language, or maybe Bob's SQL, or most likely just the BS Query Language) that transpiles to standard SQL.

Most relational databases use a variant of SQL.
Unfortunately, while SQL is a standard, its specification allows for 100s of vendor differences.
SQL is best used as a protocol for communicating with relational databases.
SQL's irregular syntax is difficult to learn and use.

While this library is still very raw, BSQL supports basic SQL operations such as querying, inserting, updating, and even nested join statements.

BSQL is a nonprocedural (relational calculus) language that specifies what is to be retrieved rather than how to retrieve it.

In relational calculus languages there is no order of operations to specify how to execute the query; it does specify what information the result should contain.

A relational calculus expression creates a new relation, which is specified in terms of variables that range over rows of the stored database relations (in tuple calculus) or over columns of the stored relations (in domain calculus).

SQL is based on tuple relational calculus (TRC).
In TRC, filtering variables select the tuples in the relation.
BSQL is more of a domain relational calculus language.
Both can be mapped to relational algebra.

SQL’s shortcomings can be grouped into these categories:
 - lack of proper orthogonality — SQL confusingly mixes tables and scalars. It has many special cases.
 - lack of compactness — SQL is a large language with 100s of keywords and its specification has 1000s of pages
 - lack of consistency — SQL is inconsistent in syntax and semantics
 - poor system cohesion — SQL does not integrate well enough with application languages
 - use of NULL

So instead of writing this SQL query:

```
SELECT user_id
FROM text_messages
  INNER JOIN (SELECT users.id AS user_id FROM users)
  ON (users.id = text_messages.user_id)) AS users
WHERE (user_id = 5)
```
You can write this in BSQL:

```
FROM {text_messages inner join users ON users.id = text_messages.user_id} AS t 
MATCH (t.user_id=5}
SELECT t.user_id

```
