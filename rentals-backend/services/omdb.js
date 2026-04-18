'use strict';
const https = require('https');

/**
 * Make a GET request to the OMDB API with the given query parameters.
 */
function omdbGet(params) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OMDB_API_KEY;
    if (!apiKey) return reject(new Error('OMDB_API_KEY is not configured'));

    const qs = new URLSearchParams({ apikey: apiKey, plot: 'short', ...params });
    const url = `https://www.omdbapi.com/?${qs.toString()}`;

    https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (data.Response === 'False') {
            return reject(new Error(data.Error || 'Movie not found'));
          }
          resolve(data);
        } catch (e) {
          reject(new Error('Failed to parse OMDB response'));
        }
      });
    }).on('error', reject);
  });
}

function formatResponse(data) {
  const id = data.imdbID;
  return {
    title:              data.Title,
    year:               data.Year && data.Year !== 'N/A'        ? data.Year        : null,
    genres:             data.Genre && data.Genre !== 'N/A'      ? data.Genre       : null,
    imdb_id:            id || null,
    imdb_link:          id ? `https://www.imdb.com/title/${id}/`                  : null,
    imdb_rating:        data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null,
    parents_guide_link: id ? `https://www.imdb.com/title/${id}/parentalguide`     : null,
    mpaa_rating:        data.Rated && data.Rated !== 'N/A'      ? data.Rated       : null,
    runtime:            data.Runtime && data.Runtime !== 'N/A'  ? data.Runtime     : null,
  };
}

async function lookupByTitle(title) {
  const data = await omdbGet({ t: title });
  return formatResponse(data);
}

async function lookupById(imdbId) {
  const data = await omdbGet({ i: imdbId });
  return formatResponse(data);
}

module.exports = { lookupByTitle, lookupById };
