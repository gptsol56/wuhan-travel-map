// Vercel Serverless 入口：复用整个 Express 应用（server/server.js 被 require 时只构建 app、不监听端口）。
// 由 vercel.json 的 routes 把 /api/crowd*、/health、/metrics 转发到这里；
// Express app 本身就是合法的 (req, res) 处理器，路由/中间件/错误处理全部原样生效。
module.exports = require('../server/server');
