"""
Static file server for local preview of lidarman-site that refuses to
serve dotfiles/dotdirs (.git, .claude, .gitignore, etc). Plain
`python3 -m http.server` serves everything in the directory indiscriminately,
which is fine for prod (GitHub Pages already hides dotfiles) but means a
local preview run misleadingly "finds" things like /.git/config that were
never actually reachable in production.

Usage: python3 serve_safe.py [port]  (defaults to 8423)
"""
import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

SITE_DIR = os.path.dirname(os.path.abspath(__file__))


class NoDotfileHandler(SimpleHTTPRequestHandler):
    def _is_blocked(self):
        return any(part.startswith(".") for part in self.path.split("/") if part)

    def send_head(self):
        if self._is_blocked():
            self.send_error(404, "File not found")
            return None
        return super().send_head()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8423
    handler = functools.partial(NoDotfileHandler, directory=SITE_DIR)
    server = ThreadingHTTPServer(("", port), handler)
    print(f"Serving {SITE_DIR} (dotfiles blocked) on http://0.0.0.0:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
