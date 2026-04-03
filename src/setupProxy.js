const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
	app.use(
		'/zoho',
		createProxyMiddleware({
			target: 'https://www.zohoapis.in',
			changeOrigin: true,
			secure: true,
			pathRewrite: {
				'^/zoho': '',
			},
			onProxyReq: (proxyReq) => {
				proxyReq.removeHeader('origin');
			},
		}),
	);
};
