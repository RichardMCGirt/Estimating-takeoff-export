from flask import Flask, request, jsonify, make_response

app = Flask(__name__)

@app.route('/inject', methods=['POST', 'OPTIONS'])
def inject():
    print("🔥 /inject hit:", request.method)

    if request.method == 'OPTIONS':
        response = make_response('', 204)  # Send a real response object
    else:
        response = make_response(jsonify({"message": "CORS post success"}), 200)

    # Add headers manually
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return response

if __name__ == '__main__':
    print("🚀 Running manual CORS test server")
    app.run(port=5000)
