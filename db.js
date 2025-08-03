const Knex = require('knex');
const { Model } = require('objection');
const knexConfig = require('./knexfile').development;

const knex = Knex(knexConfig);
Model.knex(knex);

module.exports = knex;