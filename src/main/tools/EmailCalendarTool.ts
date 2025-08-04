export class EmailCalendarTool {
    constructor() { }

    async execute(command: string): Promise<string> {
        return `Executed email/calendar command: ${command}`;
    }
}
