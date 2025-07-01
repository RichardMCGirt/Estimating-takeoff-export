from flask import Flask

app = Flask(__name__)

# Route for the home page
@app.route('/')
def home():
    return 'Hello, World!'  # This should be displayed when accessing "/"

# Route for the test page
@app.route('/test')
def test():
    return 'Test route works!'  # This should be displayed when accessing "/test"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
