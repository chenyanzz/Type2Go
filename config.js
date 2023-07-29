// @ts-check

/**
 * @typedef {'BigCamel' | 'smallCamel' | 'snake_case' | 'unchanged'} NamingConvention
 */

/**
 * @type {{naming: {[key in string]: NamingConvention}, inputModelPath: string, outputModelDir: string}}
 */
const globalConfig = {
    naming: {
        json: 'unchanged',
        bson: 'BigCamel',
        gorm: 'snake_case',
        // add more members here
        // to support more generated auto-naming tags
    },
    inputModelPath: './ts_models/*.ts',
    outputModelDir: './go_models/',
}

export { globalConfig };

