#!/usr/bin/env python3
"""
Simple HTTP server with no-cache headers to prevent browser caching
"""
import http.server
import socketserver
import os

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add no-cache headers to prevent browser caching
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # Optional: suppress default logging or customize it
        pass

if __name__ == '__main__':
    PORT = 8080
    
    # Change to the directory where this script is located
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), NoCacheHTTPRequestHandler) as httpd:
        print(f"Server started on port {PORT}")
        print(f"Serving directory: {os.getcwd()}")
        print("Cache-control headers enabled - files will not be cached")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped")

