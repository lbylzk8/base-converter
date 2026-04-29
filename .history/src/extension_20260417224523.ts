import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Base Converter extension is now active');

    const provider = new BaseConverterProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('baseConverterView', provider)
    );
}

export function deactivate() { }

class BaseConverterProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'baseConverterView';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'convert':
                    try {
                        const result = this._convert(
                            message.number,
                            message.fromBase,
                            message.toBase
                        );
                        webviewView.webview.postMessage({
                            type: 'result',
                            success: true,
                            result: result
                        });
                    } catch (error) {
                        webviewView.webview.postMessage({
                            type: 'result',
                            success: false,
                            error: (error as Error).message
                        });
                    }
                    break;
                case 'calculate':
                    try {
                        const result = this._calculate(
                            message.values,
                            message.operators,
                            message.resultBase
                        );
                        webviewView.webview.postMessage({
                            type: 'calcResult',
                            success: true,
                            result: result
                        });
                    } catch (error) {
                        webviewView.webview.postMessage({
                            type: 'calcResult',
                            success: false,
                            error: (error as Error).message
                        });
                    }
                    break;
            }
        });
    }

    private _convert(number: string, fromBase: number, toBase: number): string {
        const isNegative = number.startsWith('-');
        const cleanNumber = isNegative ? number.replace(/^-/, '') : number;

        const [num, den] = this._toFractionBigInt(cleanNumber, fromBase);
        const result = this._fromFractionBigInt(num, den, toBase);

        return isNegative ? '-' + result : result;
    }

    private _calculate(values: Array<{ value: string; base: number }>, operators: string[], resultBase: number): string {
        if (values.length === 0) {
            throw new Error('No values to calculate');
        }

        const fractions: Array<[bigint, bigint]> = [];
        for (const row of values) {
            const [num, den] = this._toFractionBigInt(row.value, row.base);
            fractions.push([num, den]);
        }

        let [resultNum, resultDen] = fractions[0];

        for (let i = 0; i < operators.length && i + 1 < fractions.length; i++) {
            const [nextNum, nextDen] = fractions[i + 1];
            const operator = operators[i];

            const commonDen = resultDen * nextDen;
            const adjustedResultNum = resultNum * nextDen;
            const adjustedNextNum = nextNum * resultDen;

            switch (operator) {
                case '+':
                    resultNum = adjustedResultNum + adjustedNextNum;
                    resultDen = commonDen;
                    break;
                case '-':
                    resultNum = adjustedResultNum - adjustedNextNum;
                    resultDen = commonDen;
                    break;
                case '*':
                    resultNum = resultNum * nextNum;
                    resultDen = resultDen * nextDen;
                    break;
                case '/':
                    if (nextNum === 0n) {
                        throw new Error('Division by zero');
                    }
                    resultNum = resultNum * nextDen;
                    resultDen = resultDen * nextNum;
                    break;
                case '**':
                    // Power: (a/b)^n = a^n / b^n, only support integer power
                    const exponent = nextNum;
                    if (nextDen !== 1n) {
                        throw new Error('Power with fractional exponent not supported');
                    }
                    if (exponent < 0n) {
                        // a^(-n) = 1 / a^n
                        const posExp = -exponent;
                        const newNum = resultDen ** posExp;
                        const newDen = resultNum ** posExp;
                        resultNum = newNum;
                        resultDen = newDen;
                    } else {
                        resultNum = resultNum ** exponent;
                        resultDen = resultDen ** exponent;
                    }
                    break;
                case '%':
                case 'mod':
                    // Modulo: a % b = a - b * floor(a/b)
                    const quotient = resultNum / nextNum;
                    const remainder = resultNum - nextNum * quotient;
                    resultNum = remainder;
                    resultDen = 1n;
                    break;
                default:
                    throw new Error(`Unknown operator: ${operator}`);
            }

            if (resultDen !== 0n) {
                const gcd = this._gcdBigInt(resultNum < 0n ? -resultNum : resultNum, resultDen);
                if (gcd !== 0n) {
                    resultNum /= gcd;
                    resultDen /= gcd;
                }
            }
        }

        return this._fromFractionBigInt(resultNum, resultDen, resultBase);
    }

    private _charToValue(c: string): number {
        if (/\d/.test(c)) return parseInt(c, 10);
        if (/[a-zA-Z]/.test(c)) {
            return c.toLowerCase().charCodeAt(0) - 97 + 10;
        }
        return 0;
    }

    private _valueToChar(value: number): string {
        if (value >= 0 && value <= 9) return String(value);
        return String.fromCharCode(97 + value - 10);
    }

    private _isValidDigit(c: string, base: number): boolean {
        if (/\d/.test(c)) return parseInt(c, 10) < base;
        if (/[a-zA-Z]/.test(c)) return this._charToValue(c) < base;
        return false;
    }

    private _gcdBigInt(a: bigint, b: bigint): bigint {
        while (b !== 0n) {
            const temp = b;
            b = a % b;
            a = temp;
        }
        return a;
    }

    private _toFractionBigInt(numStr: string, base: number): [bigint, bigint] {
        let intPart: string;
        let fracPart: string;

        if (numStr.includes('.')) {
            [intPart, fracPart] = numStr.split('.');
        } else {
            intPart = numStr;
            fracPart = '';
        }

        if (!intPart) intPart = '0';

        let num = 0n;
        for (let i = 0; i < intPart.length; i++) {
            const c = intPart[i];
            if (!this._isValidDigit(c, base)) {
                throw new Error(`Invalid digit '${c}' for base ${base}`);
            }
            num = num * BigInt(base) + BigInt(this._charToValue(c));
        }

        if (fracPart) {
            let fracNum = 0n;
            let fracPower = 1n;
            for (const c of fracPart) {
                if (!this._isValidDigit(c, base)) {
                    throw new Error(`Invalid digit '${c}' for base ${base}`);
                }
                fracNum = fracNum * BigInt(base) + BigInt(this._charToValue(c));
                fracPower *= BigInt(base);
            }

            const gcdVal = this._gcdBigInt(fracNum, fracPower);
            fracNum /= gcdVal;
            fracPower /= gcdVal;

            num = num * fracPower + fracNum;
            return [num, fracPower];
        }

        return [num, 1n];
    }

    private _fromIntBigInt(num: bigint, base: number): string {
        if (num === 0n) return '0';
        const result: string[] = [];
        let n = num;
        while (n > 0n) {
            const digit = Number(n % BigInt(base));
            result.push(this._valueToChar(digit));
            n = n / BigInt(base);
        }
        return result.reverse().join('');
    }

    private _fromFractionBigInt(num: bigint, den: bigint, base: number): string {
        if (num === 0n) return '0';

        const isNegative = num < 0n;
        num = num < 0n ? -num : num;

        const intPart = num / den;
        let fracNum = num % den;

        let result = intPart > 0n ? this._fromIntBigInt(intPart, base) : '0';

        if (fracNum > 0n) {
            result += '.';
            const seen = new Map<bigint, number>();
            const fracDigits: string[] = [];
            let pos = 0;

            while (fracNum > 0n) {
                if (seen.has(fracNum)) {
                    const idx = seen.get(fracNum)!;
                    const nonRepeat = fracDigits.slice(0, idx).join('');
                    const repeat = fracDigits.slice(idx).join('');
                    result += nonRepeat + '(' + repeat + ')';
                    return isNegative ? '-' + result : result;
                }

                seen.set(fracNum, pos);
                fracNum *= BigInt(base);
                const digit = Number(fracNum / den);
                fracDigits.push(this._valueToChar(digit));
                fracNum = fracNum % den;
                pos++;

                if (pos > 10000) {
                    result += fracDigits.join('') + '...';
                    return isNegative ? '-' + result : result;
                }
            }

            result += fracDigits.join('');
        }

        if (isNegative) result = '-' + result;
        return result;
    }

    private _getHtmlForWebview(webviewView: vscode.WebviewView): string {
        const webview = webviewView.webview;
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Base Converter</title>
    <style>
        :root {
            --vscode-font-family: var(--vscode-font-family, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
            --vscode-input-background: var(--vscode-input-background, #2d2d2d);
            --vscode-input-foreground: var(--vscode-input-foreground, #cccccc);
            --vscode-button-background: var(--vscode-button-background, #0e639c);
            --vscode-button-foreground: var(--vscode-button-foreground, #ffffff);
            --vscode-button-hoverBackground: var(--vscode-button-hoverBackground, #1177bb);
            --vscode-foreground: var(--vscode-foreground, #cccccc);
            --vscode-descriptionForeground: var(--vscode-descriptionForeground, #858585);
            --vscode-errorForeground: var(--vscode-errorForeground, #f48771);
            --vscode-successForeground: var(--vscode-successForeground, #89d185);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: var(--vscode-font-family);
            font-size: 13px;
            color: var(--vscode-foreground);
            background-color: transparent;
            padding: 10px;
        }

        .container {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        h2 {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 4px;
            color: var(--vscode-foreground);
        }

        .input-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        input, select, textarea {
            font-family: var(--vscode-font-family);
            font-size: 13px;
            padding: 6px 8px;
            border: 1px solid var(--vscode-input-background);
            border-radius: 2px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            outline: none;
        }

        input:focus, select:focus, textarea:focus {
            border-color: var(--vscode-button-background);
        }

        input::placeholder, textarea::placeholder {
            color: var(--vscode-descriptionForeground);
        }

        .row {
            display: flex;
            gap: 8px;
        }

        .row > .input-group { flex: 1; }

        button {
            font-family: var(--vscode-font-family);
            font-size: 13px;
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            transition: background-color 0.2s;
        }

        button:hover { background-color: var(--vscode-button-hoverBackground); }

        .result-container {
            margin-top: 8px;
            padding: 10px;
            background-color: var(--vscode-input-background);
            border-radius: 2px;
            min-height: 50px;
        }

        .result-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }

        .result-value, .calc-preview {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 12px;
            word-break: break-all;
            white-space: pre-wrap;
        }

        .result-value.error, .calc-preview.error { color: var(--vscode-errorForeground); }
        .result-value.success, .calc-preview.success { color: var(--vscode-successForeground); }

        .swap-btn { align-self: flex-end; padding: 6px 10px; font-size: 16px; min-width: 40px; }

        .info {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-input-background);
        }

        /* Calculator styles */
        .calc-container {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 2px solid var(--vscode-input-background);
        }

        .calc-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .calc-header h2 { margin-bottom: 0; }

        .lang-btn {
            padding: 4px 12px;
            font-size: 12px;
            min-width: 60px;
        }

        .expression-input-container { margin-bottom: 12px; }

        .expression-input {
            width: 100%;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 13px;
            padding: 8px;
            border: 1px solid var(--vscode-input-background);
            border-radius: 2px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            resize: vertical;
            min-height: 60px;
        }

        .operator-help {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }

        .function-editor {
            margin-top: 8px;
            padding: 8px;
            background-color: var(--vscode-input-background);
            border-radius: 2px;
            display: none;
        }

        .function-editor textarea {
            width: 100%;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 12px;
            padding: 6px;
            border: none;
            background: transparent;
            color: var(--vscode-input-foreground);
            resize: vertical;
            min-height: 80px;
        }

        .function-toggle {
            font-size: 12px;
            cursor: pointer;
            color: var(--vscode-button-background);
            margin-bottom: 4px;
            display: inline-block;
        }

        .function-toggle:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <h2 id="bcTitle">Base Converter</h2>

        <div class="input-group">
            <label for="numberInput">Number</label>
            <input type="text" id="numberInput" placeholder="Enter number (e.g., 101.25)" />
        </div>

        <div class="row">
            <div class="input-group">
                <label for="fromBase">From Base</label>
                <select id="fromBase">
                    <option value="2">Binary (2)</option>
                    <option value="8">Octal (8)</option>
                    <option value="10" selected>Decimal (10)</option>
                    <option value="16">Hexadecimal (16)</option>
                    <option value="36">Base 36</option>
                </select>
            </div>

            <button class="swap-btn" id="swapBtn" title="Swap bases">⇄</button>

            <div class="input-group">
                <label for="toBase">To Base</label>
                <select id="toBase">
                    <option value="2">Binary (2)</option>
                    <option value="8">Octal (8)</option>
                    <option value="10">Decimal (10)</option>
                    <option value="16" selected>Hexadecimal (16)</option>
                    <option value="36">Base 36</option>
                </select>
            </div>
        </div>

        <div class="row">
            <div class="input-group">
                <label for="customFromBase">Custom From (2-36)</label>
                <input type="number" id="customFromBase" min="2" max="36" placeholder="2-36" />
            </div>
            <div class="input-group">
                <label for="customToBase">Custom To (2-36)</label>
                <input type="number" id="customToBase" min="2" max="36" placeholder="2-36" />
            </div>
        </div>

        <button id="convertBtn">Convert</button>

        <div class="result-container">
            <div class="result-label">Result</div>
            <div class="result-value" id="resultValue">Enter a number and click Convert</div>
        </div>

        <div class="info" id="bcInfo">
            Supports bases 2-36, digits: 0-9, a-z.<br>
            Repeating decimals shown as (xxx).<br>
            Infinite precision using BigInt.
        </div>
    </div>

    <div class="container calc-container">
        <div class="calc-header">
            <h2 id="calcTitle">Multi-Base Calculator</h2>
            <button id="langToggleBtn" class="lang-btn">中文</button>
        </div>

        <div class="expression-input-container">
            <label for="expressionInput">Expression</label>
            <textarea id="expressionInput" class="expression-input" placeholder="e.g., 101(2) + 25(10) * 3(8)"></textarea>
            <div class="operator-help" id="operatorHelp">Operators: + - * / ** (power) % or mod</div>
        </div>

        <span class="function-toggle" id="functionToggle">▼ Custom Function (Python Syntax)</span>
        <div class="function-editor" id="functionEditor">
            <textarea id="customFunction" placeholder="def compute(a, b, c):&#10;    return (a + b) * c"></textarea>
        </div>

        <div class="row" style="margin-top:12px;">
            <div class="input-group">
                <label for="resultBase">Result Base</label>
                <select id="resultBase">
                    <option value="2">Binary (2)</option>
                    <option value="8">Octal (8)</option>
                    <option value="10" selected>Decimal (10)</option>
                    <option value="16">Hexadecimal (16)</option>
                    <option value="36">Base 36</option>
                </select>
            </div>
            <div class="input-group">
                <label for="customResultBase">Custom (2-36)</label>
                <input type="number" id="customResultBase" min="2" max="36" placeholder="2-36" />
            </div>
        </div>

        <button id="calcBtn" style="margin-top:8px;">Calculate</button>

        <div class="result-container">
            <div class="result-label">Parsed Expression</div>
            <div class="calc-preview" id="calcPreview">Enter expression above</div>
        </div>

        <div class="result-container">
            <div class="result-label">Result</div>
            <div class="result-value" id="calcResultValue">Enter expression and click Calculate</div>
        </div>

        <div class="info" id="calcInfo">
            Format: value(base) op value(base) ...<br>
            Example: 101(2) + FF(16) - 10(10)<br>
            Supports: + - * / ** % mod
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const strings = {
            en: {
                bcTitle: 'Base Converter',
                calcTitle: 'Multi-Base Calculator',
                langBtn: '中文',
                numberLabel: 'Number',
                numberPlaceholder: 'Enter number (e.g., 101.25)',
                fromBaseLabel: 'From Base',
                toBaseLabel: 'To Base',
                customFromLabel: 'Custom From (2-36)',
                customToLabel: 'Custom To (2-36)',
                convertBtn: 'Convert',
                enterNumber: 'Enter a number and click Convert',
                bcInfo: 'Supports bases 2-36, digits: 0-9, a-z.<br>Repeating decimals shown as (xxx).<br>Infinite precision using BigInt.',
                swapBtnTitle: 'Swap bases',
                expressionLabel: 'Expression',
                expressionPlaceholder: 'e.g., 101(2) + 25(10) * 3(8)',
                operatorHelp: 'Operators: + - * / ** (power) % or mod',
                functionToggle: '▼ Custom Function (Python Syntax)',
                functionPlaceholder: 'def compute(a, b, c):\\n    return (a + b) * c',
                resultBaseLabel: 'Result Base',
                customLabel: 'Custom (2-36)',
                calcBtn: 'Calculate',
                previewLabel: 'Parsed Expression',
                resultLabel: 'Result',
                emptyPreview: 'Enter expression above',
                emptyResult: 'Enter expression and click Calculate',
                calcInfo: 'Format: value(base) op value(base) ...<br>Example: 101(2) + FF(16) - 10(10)<br>Supports: + - * / ** % mod'
            },
            zh: {
                bcTitle: '进制转换器',
                calcTitle: '多进制计算器',
                langBtn: 'English',
                numberLabel: '数值',
                numberPlaceholder: '输入数值（如 101.25）',
                fromBaseLabel: '源进制',
                toBaseLabel: '目标进制',
                customFromLabel: '自定义源 (2-36)',
                customToLabel: '自定义目标 (2-36)',
                convertBtn: '转换',
                enterNumber: '输入数值并点击转换',
                bcInfo: '支持 2-36 进制，数字：0-9, a-z。<br>循环小数显示为 (xxx)。<br>使用 BigInt 无限精度。',
                swapBtnTitle: '交换进制',
                expressionLabel: '表达式',
                expressionPlaceholder: '例如：101(2) + 25(10) * 3(8)',
                operatorHelp: '运算符：+ - * / ** (次方) % 或 mod',
                functionToggle: '▼ 自定义函数 (Python 语法)',
                functionPlaceholder: 'def compute(a, b, c):\n    return (a + b) * c',
                resultBaseLabel: '结果进制',
                customLabel: '自定义 (2-36)',
                calcBtn: '计算',
                previewLabel: '解析表达式',
                resultLabel: '结果',
                emptyPreview: '在上方输入表达式',
                emptyResult: '输入表达式并点击计算',
                calcInfo: '格式：数值 (进制) 运算符 数值 (进制) ...<br>示例：101(2) + FF(16) - 10(10)<br>支持：+ - * / ** % mod'
            }
        };

        let currentLang = 'en';

        function t(key) {
            return strings[currentLang][key] || strings['en'][key] || key;
        }

        const numberInput = document.getElementById('numberInput');
        const fromBase = document.getElementById('fromBase');
        const toBase = document.getElementById('toBase');
        const customFromBase = document.getElementById('customFromBase');
        const customToBase = document.getElementById('customToBase');
        const swapBtn = document.getElementById('swapBtn');
        const convertBtn = document.getElementById('convertBtn');
        const resultValue = document.getElementById('resultValue');
        const bcInfo = document.getElementById('bcInfo');

        const expressionInput = document.getElementById('expressionInput');
        const resultBase = document.getElementById('resultBase');
        const customResultBase = document.getElementById('customResultBase');
        const calcBtn = document.getElementById('calcBtn');
        const calcResultValue = document.getElementById('calcResultValue');
        const calcPreview = document.getElementById('calcPreview');
        const langToggleBtn = document.getElementById('langToggleBtn');
        const operatorHelp = document.getElementById('operatorHelp');
        const functionToggle = document.getElementById('functionToggle');
        const functionEditor = document.getElementById('functionEditor');
        const customFunction = document.getElementById('customFunction');
        const calcInfo = document.getElementById('calcInfo');

        langToggleBtn.addEventListener('click', () => {
            currentLang = currentLang === 'en' ? 'zh' : 'en';
            updateLabels();
            updatePreview();
        });

        functionToggle.addEventListener('click', () => {
            functionEditor.style.display = functionEditor.style.display === 'none' ? 'block' : 'none';
        });

        function updateLabels() {
            document.getElementById('bcTitle').textContent = t('bcTitle');
            document.getElementById('calcTitle').textContent = t('calcTitle');
            langToggleBtn.textContent = t('langBtn');

            document.querySelector('label[for="numberInput"]').textContent = t('numberLabel');
            document.getElementById('numberInput').placeholder = t('numberPlaceholder');
            document.querySelector('label[for="fromBase"]').textContent = t('fromBaseLabel');
            document.querySelector('label[for="toBase"]').textContent = t('toBaseLabel');
            document.querySelector('label[for="customFromBase"]').textContent = t('customFromLabel');
            document.querySelector('label[for="customToBase"]').textContent = t('customToLabel');
            convertBtn.textContent = t('convertBtn');
            swapBtn.setAttribute('title', t('swapBtnTitle'));
            bcInfo.innerHTML = t('bcInfo');

            const enEnterNumber = 'Enter a number and click Convert';
            const zhEnterNumber = '输入数值并点击转换';
            if (resultValue.textContent === enEnterNumber || resultValue.textContent === zhEnterNumber) {
                resultValue.textContent = t('enterNumber');
            }

            document.querySelector('label[for="expressionInput"]').textContent = t('expressionLabel');
            document.getElementById('expressionInput').placeholder = t('expressionPlaceholder');
            operatorHelp.textContent = t('operatorHelp');
            functionToggle.textContent = t('functionToggle');
            document.getElementById('customFunction').placeholder = t('functionPlaceholder');
            document.querySelector('label[for="resultBase"]').textContent = t('resultBaseLabel');
            document.querySelector('label[for="customResultBase"]').textContent = t('customLabel');
            calcBtn.textContent = t('calcBtn');
            document.querySelectorAll('.calc-container .result-label')[0].textContent = t('previewLabel');
            document.querySelectorAll('.calc-container .result-label')[1].textContent = t('resultLabel');
            calcInfo.innerHTML = t('calcInfo');

            const enEmptyPreview = 'Enter expression above';
            const zhEmptyPreview = '在上方输入表达式';
            if (calcPreview.textContent === enEmptyPreview || calcPreview.textContent === zhEmptyPreview) {
                calcPreview.textContent = t('emptyPreview');
            }
            const enEmptyResult = 'Enter expression and click Calculate';
            const zhEmptyResult = '输入表达式并点击计算';
            if (calcResultValue.textContent === enEmptyResult || calcResultValue.textContent === zhEmptyResult) {
                calcResultValue.textContent = t('emptyResult');
            }
        }

        function parseExpression(expr) {
            const tokens = [];
            const regex = /([0-9a-zA-Z.]+)\((\d+)\)|(\*\*|mod|[-+*/%()])/g;
            let match;

            while ((match = regex.exec(expr)) !== null) {
                if (match[1] && match[2]) {
                    tokens.push({ type: 'value', value: match[1], base: parseInt(match[2], 10) });
                } else if (match[3]) {
                    tokens.push({ type: 'operator', value: match[3] });
                }
            }

            return tokens;
        }

        function updatePreview() {
            const expr = expressionInput.value.trim();
            if (!expr) {
                calcPreview.textContent = t('emptyPreview');
                return;
            }

            const tokens = parseExpression(expr);
            const display = tokens.map(tok => {
                if (tok.type === 'value') {
                    return currentLang === 'zh' ? tok.value + '(' + tok.base + '进制)' : tok.value + '(base ' + tok.base + ')';
                }
                return tok.value;
            }).join(' ');

            calcPreview.textContent = display || t('emptyPreview');
        }

        expressionInput.addEventListener('input', updatePreview);

        calcBtn.addEventListener('click', () => {
            const expr = expressionInput.value.trim();
            const customResBase = parseInt(customResultBase.value, 10);
            const resBase = (customResBase >= 2 && customResBase <= 36) ? customResBase : parseInt(resultBase.value, 10);

            if (!expr) {
                calcResultValue.textContent = currentLang === 'zh' ? '请输入表达式' : 'Please enter an expression';
                calcResultValue.className = 'result-value error';
                return;
            }

            const tokens = parseExpression(expr);
            const values = tokens.filter(t => t.type === 'value').map(t => ({ value: t.value, base: t.base }));
            const operators = tokens.filter(t => t.type === 'operator').map(t => t.value);

            if (values.length === 0) {
                calcResultValue.textContent = currentLang === 'zh' ? '请至少输入一个数值' : 'Please enter at least one value';
                calcResultValue.className = 'result-value error';
                return;
            }

            vscode.postMessage({
                type: 'calculate',
                expression: expr,
                values: values,
                operators: operators,
                resultBase: resBase
            });
        });

        function getEffectiveFromBase() {
            const custom = parseInt(customFromBase.value, 10);
            return (custom >= 2 && custom <= 36) ? custom : parseInt(fromBase.value, 10);
        }

        function getEffectiveToBase() {
            const custom = parseInt(customToBase.value, 10);
            return (custom >= 2 && custom <= 36) ? custom : parseInt(toBase.value, 10);
        }

        swapBtn.addEventListener('click', () => {
            const temp = fromBase.value;
            fromBase.value = toBase.value;
            toBase.value = temp;
            const tempCustom = customFromBase.value;
            customFromBase.value = customToBase.value;
            customToBase.value = tempCustom;
        });

        convertBtn.addEventListener('click', () => {
            const number = numberInput.value.trim();
            if (!number) {
                resultValue.textContent = t('enterNumber');
                resultValue.className = 'result-value error';
                return;
            }
            const fromB = getEffectiveFromBase();
            const toB = getEffectiveToBase();
            vscode.postMessage({
                type: 'convert',
                number: number,
                fromBase: fromB,
                toBase: toB
            });
        });

        numberInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') convertBtn.click();
        });

        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.type === 'result') {
                if (message.success) {
                    resultValue.textContent = message.result;
                    resultValue.className = 'result-value success';
                } else {
                    resultValue.textContent = 'Error: ' + message.error;
                    resultValue.className = 'result-value error';
                }
            }
            if (message.type === 'calcResult') {
                if (message.success) {
                    calcResultValue.textContent = message.result;
                    calcResultValue.className = 'result-value success';
                } else {
                    calcResultValue.textContent = 'Error: ' + message.error;
                    calcResultValue.className = 'result-value error';
                }
            }
        });

        updateLabels();
    </script>
</body>
</html>`;
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
