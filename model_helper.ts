// some typedef & decorators for ts model to use

type NamingConvention = 'BigCamel' | 'smallCamel' | 'snake_case'

type int = number
type float = number

interface GoModelConfig {
    packageName?: string
    modelName?: string
    generateTags?: string[]
}

function GoModel(cfg?: GoModelConfig) {
    return function(clz) {}
}

function ExtraTags(cfg: Record<string, string | string[]>) {
    return function(clz, fieldName) {}
}

function CustomNaming(cfg: Record<string, string>){
    return function(clz, fieldName) {}
}