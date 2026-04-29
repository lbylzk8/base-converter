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

        // Handle messages from the webview
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
            fracPower = fracPower;

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

            // fracNum === 0n means we have a terminating decimal
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

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

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

        input, select {
            font-family: var(--vscode-font-family);
            font-size: 13px;
            padding: 6px 8px;
            border: 1px solid var(--vscode-input-background);
            border-radius: 2px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            outline: none;
        }

        input:focus, select:focus {
            border-color: var(--vscode-button-background);
        }

        input::placeholder {
            color: var(--vscode-descriptionForeground);
        }

        .row {
            display: flex;
            gap: 8px;
        }

        .row > .input-group {
            flex: 1;
        }

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

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .result-container {
            margin-top: 8px;
            padding: 10px;
            background-color: var(--vscode-input-background);
            border-radius: 2px;
            min-height: 60px;
        }

        .result-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }

        .result-value {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 12px;
            word-break: break-all;
            white-space: pre-wrap;
        }

        .result-value.error {
            color: var(--vscode-errorForeground);
        }

        .result-value.success {
            color: var(--vscode-successForeground);
        }

        .swap-btn {
            align-self: flex-end;
            padding: 6px 10px;
            font-size: 16px;
            min-width: 40px;
        }

        .info {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-input-background);
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>Base Converter</h2>

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

        <div class="info">
            Supports bases 2-36, digits: 0-9, a-z.<br>
            Repeating decimals shown as (xxx).<br>
            Infinite precision using BigInt.
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const numberInput = document.getElementById('numberInput');
        const fromBase = document.getElementById('fromBase');
        const toBase = document.getElementById('toBase');
        const customFromBase = document.getElementById('customFromBase');
        const customToBase = document.getElementById('customToBase');
        const swapBtn = document.getElementById('swapBtn');
        const convertBtn = document.getElementById('convertBtn');
        const resultValue = document.getElementById('resultValue');

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
                resultValue.textContent = 'Please enter a number';
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
            if (e.key === 'Enter') {
                convertBtn.click();
            }
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
        });
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
