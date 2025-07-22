from flask import Flask, request, render_template, jsonify
import requests

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/humanize', methods=['POST'])
def humanize():
    ai_text = request.form.get('aiText', '')
    
    payload = {
        'aiText': ai_text,
        'captchaInput': '',
        'mode': 'BASIC',
        'readability': 'Standard',
        'freeze_keywords': ''
    }

    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }

    try:
        response = requests.post('https://www.humanizeai.io/humanize_adv.php', data=payload, headers=headers)
        result = response.json()
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
