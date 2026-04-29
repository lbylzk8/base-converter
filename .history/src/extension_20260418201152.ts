import * as vscode from 'vscode';
import * as fs from 'fs';

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
                            message.functions,
                            message.functionCode,
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

    private _calculate(
        values: Array<{ value: string; base: number }>,
        operators: string[],
        functions: Array<{ name: string; innerExpr: string }>,
        functionCode: string,
        resultBase: number
    ): string {
        // First, evaluate any custom functions using Python-like syntax
        const functionResults: bigint[] = [];

        if (functions.length > 0 && functionCode) {
            // Parse and execute the custom function
            // Expected format: def fun(a): return a**3
            const funcMatch = functionCode.match(/def\s+(\w+)\s*\((\w+)\)\s*:\s*return\s+(.+)/);
            if (funcMatch) {
                const [, funcName, paramName, body] = funcMatch;

                for (const fn of functions) {
                    if (fn.name === funcName) {
                        // Parse the inner expression to get the argument value
                        const innerTokens = this._parseSimpleExpression(fn.innerExpr);
                        if (innerTokens.length === 1 && innerTokens[0].type === 'value') {
                            const [argNum, argDen] = this._toFractionBigInt(innerTokens[0].value, innerTokens[0].base);
                            const arg = argNum / argDen;

                            // Evaluate the function body with the argument
                            const result = this._evalFunctionBody(body, paramName, arg);
                            functionResults.push(result);
                        }
                    }
                }
            }
        }

        // Build the final list of values (including function results)
        const allValues: bigint[] = [];

        if (values.length === 0 && functionResults.length > 0) {
            // Only functions in expression
            for (const result of functionResults) {
                allValues.push(result);
            }
        } else {
            // Mix of values and functions
            for (const v of values) {
                const [num, den] = this._toFractionBigInt(v.value, v.base);
                allValues.push(num / den);
            }
            for (const result of functionResults) {
                allValues.push(result);
            }
        }

        if (allValues.length === 0) {
            throw new Error('No values to calculate');
        }

        // Perform operations
        let resultNum = allValues[0];
        let resultDen = 1n;

        for (let i = 0; i < operators.length && i + 1 < allValues.length; i++) {
            const nextNum = allValues[i + 1];
            const nextDen = 1n;
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
                    if (nextDen !== 1n) {
                        throw new Error('Power with fractional exponent not supported');
                    }
                    const exponent = nextNum;
                    if (exponent < 0n) {
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

    private _parseSimpleExpression(expr: string): Array<{ type: string; value: string; base: number }> {
        const tokens: Array<{ type: string; value: string; base: number }> = [];
        const regex = /([0-9a-zA-Z.]+)\((\d+)\)/g;
        let match;
        while ((match = regex.exec(expr)) !== null) {
            tokens.push({ type: 'value', value: match[1], base: parseInt(match[2], 10) });
        }
        return tokens;
    }

    private _evalFunctionBody(body: string, paramName: string, arg: bigint): bigint {
        // Replace parameter name with actual value
        let evalBody = body.replace(new RegExp(paramName, 'g'), arg.toString());
        // Handle ** operator
        evalBody = evalBody.replace(/\*\*/g, '**');
        try {
            const result = Function('"use strict"; return BigInt(' + evalBody + ')')();
            return BigInt(result);
        } catch (e) {
            throw new Error(`Failed to evaluate function: ${body}`);
        }
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

        // Get resource URIs
        const htmlFile = vscode.Uri.joinPath(this._extensionUri, 'webview', 'index.html');
        const cssFile = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'styles.css'));
        const jsFile = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'app.js'));

        // Read HTML template
        let html = fs.readFileSync(htmlFile.fsPath, 'utf8');

        // Replace placeholders
        html = html.replace(/\$\{cspSource\}/g, webview.cspSource)
            .replace(/\$\{nonce\}/g, nonce)
            .replace(/\$\{cssFile\}/g, cssFile.toString())
            .replace(/\$\{jsFile\}/g, jsFile.toString());

        return html;
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
