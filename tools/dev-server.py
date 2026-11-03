# -*- coding: utf-8 -*-
# 本地开发预览服务器：与 python -m http.server 等价，但对 HTML/JS/CSS 返回
# Cache-Control: no-cache（强制每次协商缓存，改完代码刷新即生效），
# 其余资源（瓦片/图标/数据）不加头，行为同默认。
# 用法: python tools/dev-server.py [port]   默认 8899
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

NOCACHE_EXT = ('.html', '.htm', '.js', '.css', '.json')

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        p = self.path.split('?', 1)[0].split('#', 1)[0].lower()
        if p.endswith(NOCACHE_EXT):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass  # 预览服务器保持安静

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    print(f'dev-server: http://127.0.0.1:{port}/ (JS/CSS/HTML no-cache)')
    HTTPServer(('127.0.0.1', port), Handler).serve_forever()
