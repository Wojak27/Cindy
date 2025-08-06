interface CalculationResult {
    result: number;
    expression: string;
    error?: string;
}

export class CalculatorTool {
    constructor() { }

    async execute(expression: string): Promise<CalculationResult> {
        try {
            // Sanitize the expression to prevent code injection
            const sanitizedExpression = this.sanitizeExpression(expression);

            // Evaluate the mathematical expression safely
            const result = this.evaluateExpression(sanitizedExpression);

            return {
                result,
                expression: sanitizedExpression
            };
        } catch (error) {
            return {
                result: 0,
                expression,
                error: error instanceof Error ? error.message : 'Invalid mathematical expression'
            };
        }
    }

    private sanitizeExpression(expression: string): string {
        // Remove any potentially dangerous characters and keep only mathematical operators
        const allowed = /^[0-9+\-*/.() \t\n\r]+$/;

        if (!allowed.test(expression)) {
            throw new Error('Expression contains invalid characters');
        }

        // Remove extra whitespace
        return expression.replace(/\s+/g, ' ').trim();
    }

    private evaluateExpression(expression: string): number {
        // Use Function constructor for safer evaluation than eval()
        // This still has risks but is more controlled
        try {
            // Replace common mathematical functions with Math equivalents
            const mathExpression = expression
                .replace(/\bsin\(/g, 'Math.sin(')
                .replace(/\bcos\(/g, 'Math.cos(')
                .replace(/\btan\(/g, 'Math.tan(')
                .replace(/\bsqrt\(/g, 'Math.sqrt(')
                .replace(/\babs\(/g, 'Math.abs(')
                .replace(/\bfloor\(/g, 'Math.floor(')
                .replace(/\bceil\(/g, 'Math.ceil(')
                .replace(/\bround\(/g, 'Math.round(')
                .replace(/\bpi\b/g, 'Math.PI')
                .replace(/\be\b/g, 'Math.E');

            // Create a safe evaluation function
            const func = new Function('Math', `return ${mathExpression}`);
            const result = func(Math);

            if (typeof result !== 'number' || isNaN(result)) {
                throw new Error('Result is not a valid number');
            }

            return result;
        } catch (error) {
            throw new Error('Failed to evaluate mathematical expression');
        }
    }

    // Additional mathematical operations
    async calculate(operation: 'add' | 'subtract' | 'multiply' | 'divide' | 'power', a: number, b: number): Promise<CalculationResult> {
        try {
            let result: number;
            let expression: string;

            switch (operation) {
                case 'add':
                    result = a + b;
                    expression = `${a} + ${b}`;
                    break;
                case 'subtract':
                    result = a - b;
                    expression = `${a} - ${b}`;
                    break;
                case 'multiply':
                    result = a * b;
                    expression = `${a} * ${b}`;
                    break;
                case 'divide':
                    if (b === 0) {
                        throw new Error('Division by zero is not allowed');
                    }
                    result = a / b;
                    expression = `${a} / ${b}`;
                    break;
                case 'power':
                    result = Math.pow(a, b);
                    expression = `${a} ^ ${b}`;
                    break;
                default:
                    throw new Error(`Unsupported operation: ${operation}`);
            }

            return {
                result,
                expression
            };
        } catch (error) {
            return {
                result: 0,
                expression: `${operation}(${a}, ${b})`,
                error: error instanceof Error ? error.message : 'Calculation failed'
            };
        }
    }

    // Unit conversions
    async convert(value: number, fromUnit: string, toUnit: string): Promise<CalculationResult> {
        try {
            const result = this.performUnitConversion(value, fromUnit, toUnit);
            return {
                result,
                expression: `${value} ${fromUnit} to ${toUnit}`
            };
        } catch (error) {
            return {
                result: 0,
                expression: `${value} ${fromUnit} to ${toUnit}`,
                error: error instanceof Error ? error.message : 'Unit conversion failed'
            };
        }
    }

    private performUnitConversion(value: number, fromUnit: string, toUnit: string): number {
        const conversions: Record<string, Record<string, number>> = {
            // Length conversions (to meters)
            'length': {
                'mm': 0.001,
                'cm': 0.01,
                'm': 1,
                'km': 1000,
                'in': 0.0254,
                'ft': 0.3048,
                'yd': 0.9144,
                'mi': 1609.34
            },
            // Weight conversions (to grams)
            'weight': {
                'mg': 0.001,
                'g': 1,
                'kg': 1000,
                'oz': 28.3495,
                'lb': 453.592
            }
        };

        // Check for temperature conversions first
        const temperatureUnits = ['celsius', 'fahrenheit', 'kelvin'];
        if (temperatureUnits.includes(fromUnit) && temperatureUnits.includes(toUnit)) {
            return this.convertTemperature(value, fromUnit, toUnit);
        }

        // Determine unit category for other conversions
        let category = '';
        for (const [cat, units] of Object.entries(conversions)) {
            if (units[fromUnit] && units[toUnit]) {
                category = cat;
                break;
            }
        }

        if (!category) {
            throw new Error(`Unsupported unit conversion: ${fromUnit} to ${toUnit}`);
        }

        const fromMultiplier = conversions[category][fromUnit];
        const toMultiplier = conversions[category][toUnit];
        return (value * fromMultiplier) / toMultiplier;
    }

    private convertTemperature(value: number, fromUnit: string, toUnit: string): number {
        // Convert to Celsius first
        let celsius: number;

        switch (fromUnit) {
            case 'celsius':
                celsius = value;
                break;
            case 'fahrenheit':
                celsius = (value - 32) * 5 / 9;
                break;
            case 'kelvin':
                celsius = value - 273.15;
                break;
            default:
                throw new Error(`Unsupported temperature unit: ${fromUnit}`);
        }

        // Convert from Celsius to target unit
        switch (toUnit) {
            case 'celsius':
                return celsius;
            case 'fahrenheit':
                return celsius * 9 / 5 + 32;
            case 'kelvin':
                return celsius + 273.15;
            default:
                throw new Error(`Unsupported temperature unit: ${toUnit}`);
        }
    }
}