@GoModel()
class Base {}

@GoModel({
    packageName: 'model',
    modelName: 'UserModel',
    generateTags: ['json', 'gorm', 'bson'],
})
class User extends Base {
    @ExtraTags({json: 'omitempty'})
    id: string

    @CustomNaming({bson: 'UserName'})
    name: string

    @ExtraTags({sometag: ['a', 'b']})
    someArray: Date[]

    someNullable?: string

    someMap: Map<string, int[]>

    someInlineType: {
        a: int
        b: string
    }
}

