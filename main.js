// @ts-check

import * as fs from 'fs';
import * as naming from 'naming-style';
import * as tsmorph from "ts-morph";
import { globalConfig } from './config.js';

/** @type {Record<import('./config').NamingConvention, (s: string)=>string>} */
const NamingConventionMap = {
    // @ts-ignore
    'BigCamel': naming.pascal,
    // @ts-ignore
    'smallCamel': naming.camel,
    // @ts-ignore
    'snake_case': naming.snake,
}

/**
 * @param {tsmorph.Node | null | undefined} node 
 */
function getLiteralNodeValue(node) {
    if (!node) return null
    const txt = node.getText()
    // TODO UNSAFE HERE
    return eval(`(${txt})`)
}

/**
 * @param {tsmorph.ObjectLiteralExpression?} obj
 * @param {string} propName
 */
function getPropertyLiteralValue(obj, propName) {
    const prop = obj?.getProperty(propName) ?? null
    return getLiteralNodeValue(prop?.asKind(tsmorph.SyntaxKind.PropertyAssignment)?.getInitializer())
}


/** @typedef {{packageName?: string, modelName?: string, generateTags?: string[]}} GoModelConfig */

/** @typedef {{baseIndent: number, importPackages: string[]}} GenerationConfig */

/**
 * int和float通过typedef处理过了
 * 只需要处理 boolean Date ...
 * @param {tsmorph.TypeNode} tstype 
 * @param {GenerationConfig} genConfig
 * @param {GoModelConfig} modelConfig
 */
function TsTypeToGoType(tstype, genConfig, modelConfig) {
    if (tstype.getText().startsWith('{')) {
        const innerClass = tstype.asKindOrThrow(tsmorph.SyntaxKind.TypeLiteral)
        return TsClassToGoSrc(innerClass, { annonymous: true, baseIndent: genConfig.baseIndent })
    } else {
        let tstypename = tstype.getText()

        /** @type {(s:string) => string} */
        let handleTypename = (tstypename) => {
            switch (tstypename) {
                case 'Date': {
                    if (('time' in genConfig.importPackages) == false) {
                        genConfig.importPackages.push('time')
                    }
                    return 'time.Time'
                }
                case 'boolean': return 'bool'
            }
            // 处理数组
            if (tstypename.endsWith('[]')) {
                tstypename = '[]' + handleTypename(tstypename.substring(0, tstypename.length - 2))
            }
            // 处理map
            let res = tstypename.match(/Map<(.*), *(.*)>/)
            if (res) {
                tstypename = `map[${handleTypename(res[1])}]${handleTypename(res[2])}`
            }
            return tstypename
        }
        return handleTypename(tstypename)
    }
}


/**
 * @param {tsmorph.PropertyDeclaration} member 
 * @param {GoModelConfig} modelConfig
 */
function getGoTags(member, modelConfig) {
    const generatedTags = modelConfig.generateTags?.map((tagname) =>
        [tagname, NamingConventionMap[globalConfig.naming[tagname]](member.getName())]) ?? []

    /** @type {Record<string, string>} */
    const customNamings = getLiteralNodeValue(member.getDecorator?.('CustomNaming')?.getArguments()?.[0]?.asKind(tsmorph.SyntaxKind.ObjectLiteralExpression)) ?? {}

    Object.entries(customNamings).forEach(([tagname, fieldname]) => {
        let index = generatedTags.findIndex(([exsitingTagname, _]) => exsitingTagname == tagname)
        if (index == -1) {
            generatedTags.push([tagname, fieldname])
        } else {
            generatedTags[index][1] = fieldname
        }
    })


    /** @type {Record<string, string | string[]>} */
    const allExtraTags = getLiteralNodeValue(member.getDecorator?.('ExtraTags')?.getArguments()?.[0]?.asKind(tsmorph.SyntaxKind.ObjectLiteralExpression)) ?? {}

    Object.entries(allExtraTags).forEach(([tagname, _extraTags]) => {
        // @ts-ignore
        const extraTags = typeof _extraTags === 'string' ? _extraTags : _extraTags.join(';')
        let index = generatedTags.findIndex(([exsitingTagname, _]) => exsitingTagname == tagname)
        if (index == -1) {
            generatedTags.push([tagname, extraTags])
        } else {
            generatedTags[index][1] += ';' + extraTags
        }
    })

    return generatedTags
}

/**
 * @param {tsmorph.PropertyDeclaration} member 
 * @param {GenerationConfig} genConfig
 * @param {GoModelConfig} modelConfig
 */
function TsMemberToGoField(member, genConfig, modelConfig) {
    // TODO decorators
    const memberName = member.getName()
    const typeNode = member.getTypeNode()
    const nullable = !!member.getQuestionTokenNode()
    return {
        // @ts-ignore
        name: naming.pascal(memberName),
        type: (nullable ? '*' : '') + (typeNode ? TsTypeToGoType(typeNode, genConfig, modelConfig) : 'UNKNOWN'),
        tags: getGoTags(member, modelConfig),
        comment: (nullable ? 'nullable' : '')
    }
}

function indent(depth) {
    return ''.padEnd(depth * 4)
}

/**
 * @param {[string, string][]} tags
 */
function GoTagsToString(tags) {
    if (!tags) return ''
    return '`' + tags.map(([tagname, value]) => `${tagname}:"${value}"`).join(' ') + '`'
}

/**
 * @param {tsmorph.TypeLiteralNode | tsmorph.ClassDeclaration} clz
 * @param {{baseIndent: number, annonymous: boolean}} cfg
 */
function TsClassToGoSrc(clz, cfg) {

    const goModelArgs = clz instanceof tsmorph.ClassDeclaration ?
        clz.getDecorator?.('GoModel')?.getArguments()?.[0]?.asKind(tsmorph.SyntaxKind.ObjectLiteralExpression) ?? null : null;

    /** @type {GoModelConfig?} */
    const modelConfig = {
        packageName: getPropertyLiteralValue(goModelArgs, 'packageName') ?? 'model',
        modelName: getPropertyLiteralValue(goModelArgs, 'modelName') ?? (clz instanceof tsmorph.ClassDeclaration ? clz.getName() : 'UNNAMED'),
        generateTags: getPropertyLiteralValue(goModelArgs, 'generateTags') ?? ['json'],
    }
    let genConfig = { baseIndent: cfg.baseIndent + 1, importPackages: [] }
    let def = {
        ...modelConfig,
        baseClassName: clz instanceof tsmorph.ClassDeclaration ? clz.getBaseClass?.()?.getName() : null,
        fields: clz.getProperties().map((member) => TsMemberToGoField(member, genConfig, modelConfig)),
    }

    let lines = []
    let fieldLines = def.fields.map((field) =>
        `${indent(1 + cfg.baseIndent)}${field.name} ${field.type} ${GoTagsToString(field.tags)} ${field.comment ? '/* ' + field.comment + ' */' : ''}`)

    if (cfg.annonymous) {
        lines.push(`struct {`)
    } else {
        lines.push(`// Generated By Type2Go At ${new Date().toLocaleString()} //`, '')
        lines.push(`package ${def.packageName}`, '')
        if (genConfig.importPackages.length > 0) {
            lines.push('import (')
            lines = lines.concat(genConfig.importPackages.map((pkg) => `${indent(1)}"${pkg}"`))
            lines.push(`)`, '')
        }
        lines.push(`type ${def.modelName} struct {`)
    }

    if (def.baseClassName)
        lines.push(`${indent(1 + cfg.baseIndent)}${def.baseClassName}`, '')
    lines = lines.concat(fieldLines)
    lines.push(`${indent(cfg.baseIndent)}}`)

    const src = lines.join('\n')
    return src
}

function main() {
    const project = new tsmorph.Project();
    project.addSourceFilesAtPaths(globalConfig.inputModelPath)
    const classes = project.getSourceFiles().flatMap((src) => src.getClasses())
    const goModelClasses = classes.filter((clz) => clz.getDecorator('GoModel'))
    goModelClasses.forEach((clz) => {
        var goSrc = TsClassToGoSrc(clz, { annonymous: false, baseIndent: 0 })
        fs.writeFileSync(`${globalConfig.outputModelDir}/${clz.getName()}.go`, goSrc)
    })
}

main()