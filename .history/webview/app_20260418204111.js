// Webview JavaScript
(function() {
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
            functionPlaceholder: 'def compute(a, b, c):\n    return (a + b) * c',
            clearBtn: 'Clear',
            backBtn: '←',
            baseBtn: '(base)',
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
            clearBtn: '清除',
            backBtn: '←',
            baseBtn: '(进制)',
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

    // DOM Elements
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

    // Language toggle
    langToggleBtn.addEventListener('click', () => {
        currentLang = currentLang === 'en' ? 'zh' : 'en';
        updateLabels();
        updatePreview();
    });

    // Function editor toggle
    functionToggle.addEventListener('click', () => {
        functionEditor.style.display = functionEditor.style.display === 'none' ? 'block' : 'none';
    });

    function updateLabels() {
        document.getElementById('bcTitle').textContent = t('bcTitle');
        document.getElementById('calcTitle').textContent = t('calcTitle');
        langToggleBtn.textContent = t('langBtn');

        document.getElementById('lblNumber').textContent = t('numberLabel');
        numberInput.placeholder = t('numberPlaceholder');
        document.getElementById('lblFrom').textContent = t('fromBaseLabel');
        document.getElementById('lblTo').textContent = t('toBaseLabel');
        document.getElementById('lblCustomFrom').textContent = t('customFromLabel');
        document.getElementById('lblCustomTo').textContent = t('customToLabel');
        convertBtn.textContent = t('convertBtn');
        swapBtn.setAttribute('title', t('swapBtnTitle'));
        bcInfo.innerHTML = t('bcInfo');

        if (resultValue.textContent === 'Enter a number and click Convert' ||
            resultValue.textContent === '输入数值并点击转换') {
            resultValue.textContent = t('enterNumber');
        }

        document.getElementById('lblExpression').textContent = t('expressionLabel');
        expressionInput.placeholder = t('expressionPlaceholder');
        operatorHelp.textContent = t('operatorHelp');
        functionToggle.textContent = t('functionToggle');
        customFunction.placeholder = t('functionPlaceholder');
        document.getElementById('lblResultBase').textContent = t('resultBaseLabel');
        document.getElementById('lblCustomResult').textContent = t('customLabel');
        calcBtn.textContent = t('calcBtn');
        document.getElementById('lblPreview').textContent = t('previewLabel');
        document.getElementById('lblCalcResult').textContent = t('resultLabel');
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

    // Parse expression: 101(2) + 25(10) * 3(8) or fun(10(10))
    function parseExpression(expr) {
        const tokens = [];
        let i = 0;

        while (i < expr.length) {
            // Skip whitespace
            if (/\s/.test(expr[i])) {
                i++;
                continue;
            }

            // Check for operators
            if (expr.slice(i, i + 2) === '**') {
                tokens.push({ type: 'operator', value: '**' });
                i += 2;
                continue;
            }
            if (expr.slice(i, i + 3) === 'mod') {
                tokens.push({ type: 'operator', value: 'mod' });
                i += 3;
                continue;
            }
            if (/[+\-*/%()]/.test(expr[i])) {
                tokens.push({ type: 'operator', value: expr[i] });
                i++;
                continue;
            }

            // Check for fun(...) pattern
            if (expr.slice(i, i + 4) === 'fun(') {
                i += 4; // skip 'fun('
                const innerStart = i;
                let depth = 1;
                while (i < expr.length && depth > 0) {
                    if (expr[i] === '(') depth++;
                    else if (expr[i] === ')') depth--;
                    if (depth > 0) i++;
                }
                const innerExpr = expr.slice(innerStart, i);
                tokens.push({ type: 'function', name: 'fun', innerExpr: innerExpr.trim() });
                i++; // skip closing ')'
                continue;
            }

            // Check for value(base) pattern
            const valueMatch = expr.slice(i).match(/^([0-9a-zA-Z.]+)\((\d+)\)/);
            if (valueMatch) {
                tokens.push({ type: 'value', value: valueMatch[1], base: parseInt(valueMatch[2], 10) });
                i += valueMatch[0].length;
                continue;
            }

            // Unknown character, skip
            i++;
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
            } else if (tok.type === 'function') {
                // Parse inner expression to show function with base
                const innerTokens = parseExpression(tok.innerExpr);
                const innerDisplay = innerTokens.map(innerTok => {
                    if (innerTok.type === 'value') {
                        return currentLang === 'zh' ? innerTok.value + '(' + innerTok.base + '进制)' : innerTok.value + '(base ' + innerTok.base + ')';
                    }
                    return innerTok.value;
                }).join(' ');
                return currentLang === 'zh' ? `fun(${innerDisplay})` : `fun(${innerDisplay})`;
            }
            return tok.value;
        }).join(' ');

        calcPreview.textContent = display || t('emptyPreview');
    }

    expressionInput.addEventListener('input', updatePreview);

    // Calculate button
    calcBtn.addEventListener('click', () => {
        const expr = expressionInput.value.trim();
        const customResBase = parseInt(customResultBase.value, 10);
        const resBase = (customResBase >= 2 && customResBase <= 36) ? customResBase : parseInt(resultBase.value, 10);
        const funcCode = customFunction.value.trim();

        if (!expr) {
            calcResultValue.textContent = currentLang === 'zh' ? '请输入表达式' : 'Please enter an expression';
            calcResultValue.className = 'result-value error';
            return;
        }

        const tokens = parseExpression(expr);

        // Build tokens with operator info - each value/function has its trailing operator
        const tokensData = [];
        let pendingOp = null;

        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.type === 'operator') {
                pendingOp = t.value;
            } else if (t.type === 'value' || t.type === 'function') {
                tokensData.push({
                    type: t.type,
                    value: t.type === 'value' ? t.value : undefined,
                    base: t.type === 'value' ? t.base : undefined,
                    innerExpr: t.type === 'function' ? t.innerExpr : undefined,
                    name: t.type === 'function' ? t.name : undefined,
                    operatorAfter: pendingOp // operator that comes before this item
                });
                pendingOp = null;
            }
        }

        const values = tokensData.filter(t => t.type === 'value').map(t => ({ value: t.value, base: t.base }));
        const functions = tokensData.filter(t => t.type === 'function').map(t => ({ name: t.name, innerExpr: t.innerExpr }));
        const operators = tokensData.map(t => t.operatorAfter).filter(op => op !== null && op !== undefined);

        if (values.length === 0 && functions.length === 0) {
            calcResultValue.textContent = currentLang === 'zh' ? '请至少输入一个数值' : 'Please enter at least one value';
            calcResultValue.className = 'result-value error';
            return;
        }

        vscode.postMessage({
            type: 'calculate',
            expression: expr,
            values: values,
            operators: operators,
            functions: functions,
            tokens: tokensData,
            functionCode: funcCode,
            resultBase: resBase
        });
    });

    // Button pad
    const buttonPad = document.querySelector('.button-pad');
    let lastBase = 10; // Default base for next value

    if (buttonPad) {
        buttonPad.addEventListener('click', (e) => {
            if (e.target.classList.contains('pad-btn')) {
                const value = e.target.getAttribute('data-value');
                const start = expressionInput.selectionStart;
                const end = expressionInput.selectionEnd;
                const text = expressionInput.value;

                if (value === 'clear') {
                    expressionInput.value = '';
                    lastBase = 10;
                } else if (value === 'back') {
                    if (start > 0) {
                        expressionInput.value = text.slice(0, start - 1) + text.slice(end);
                        expressionInput.selectionStart = expressionInput.selectionEnd = start - 1;
                    }
                } else if (value === '(base)') {
                    // Insert () with cursor inside for base input
                    const insertText = '()';
                    expressionInput.value = text.slice(0, start) + insertText + text.slice(end);
                    expressionInput.selectionStart = start + 1;
                    expressionInput.selectionEnd = start + 1;
                } else if (value.startsWith('insert_')) {
                    // Insert operator at cursor position
                    const op = value.replace('insert_', '');
                    expressionInput.value = text.slice(0, start) + op + text.slice(end);
                    expressionInput.selectionStart = expressionInput.selectionEnd = start + op.length;
                } else if (value === 'fun(') {
                    // Insert fun( with cursor inside
                    const insertText = 'fun()';
                    expressionInput.value = text.slice(0, start) + insertText + text.slice(end);
                    expressionInput.selectionStart = start + 4;
                    expressionInput.selectionEnd = start + 4;
                } else {
                    // Number or letter - build value then auto-add (base)
                    // Check if we're right before a ( to insert base
                    const nextChar = text[start];
                    if (nextChar === '(') {
                        // Insert before the (
                        expressionInput.value = text.slice(0, start) + value + text.slice(end);
                        expressionInput.selectionStart = expressionInput.selectionEnd = start + 1;
                    } else {
                        // Just insert the digit/letter
                        expressionInput.value = text.slice(0, start) + value + text.slice(end);
                        expressionInput.selectionStart = expressionInput.selectionEnd = start + value.length;
                    }
                }
                updatePreview();
                expressionInput.focus();
            }
        });
    }

    // Base converter functions
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
        if (e.key === 'Enter') {
            convertBtn.click();
        }
    });

    // Handle messages from extension
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

    // Initialize
    updateLabels();
    console.log('Webview initialized');
})();
