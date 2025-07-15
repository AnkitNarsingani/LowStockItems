// netlify/functions/zoho.js
const fetch = require('node-fetch');

exports.handler = async function(event) {
  const ZOHO_TOKEN = process.env.ZOHO_TOKEN;
  const ORG_ID = process.env.ZOHO_ORG_ID;
  const endpoint = event.queryStringParameters.endpoint || "items";

  const allowed = ["items", "purchaseorders"];
  if (!allowed.includes(endpoint)) {
    return { statusCode: 400, body: "Endpoint not allowed" };
  }

  const url = `https://www.zohoapis.in/books/v3/${endpoint}?organization_id=${ORG_ID}&per_page=200`;
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${ZOHO_TOKEN}` }
  });
  const data = await res.text();
  return {
    statusCode: res.status,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: data
  };
}
