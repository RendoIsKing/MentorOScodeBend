import {Request, Response} from 'express';
import {validate} from 'class-validator';
import {ValidationErrorResponse} from '../../types/ValidationErrorResponse';
import {RolesEnum} from '../../types/RolesEnum';
import {Module} from "../Models/Module";
import {UpdateModuleInput} from "../Inputs/UpdateModule.input";

const LIMIT = 10;

export class ModuleController {

    static create = async (req: Request, res: Response): Promise<Response> => {
        const input: UpdateModuleInput = req.body;

        const moduleInput = new UpdateModuleInput();

        moduleInput.title = input.title;

        const errors = await validate(moduleInput);

        if (errors.length) {
            const errorsInfo: ValidationErrorResponse[] = errors.map(error => ({
                property: error.property,
                constraints: error.constraints
            }));

            return res.status(400).json({error: {message: 'VALIDATIONS_ERROR', info: errorsInfo}});
        }
        try {
            const checkModule = await Module.findOne({title: input.title});

            // @ts-ignore
            if (checkModule) {
                return res.status(400).json({error: {message: 'module already preset with same name.'}});
            }
            const moduleData = await Module.create({
                title: input.title,

            });
            return res.json({data: moduleData, message: "module created sucessfully"})
        } catch (err) {
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }

    static index = async (_req: any, res: Response): Promise<Response> => {
        try {
            const perPage = (_req.query && _req.query.perPage > 0 ? parseInt(_req.query.perPage) : LIMIT);
            let skip = (_req.query && _req.query.page > 0 ? parseInt(_req.query.page) - 1 : 0) * perPage;

            let dataToFind: any = {role: {$ne: RolesEnum.ADMIN}};

            if (_req.query.title) {
                dataToFind.title = _req.query.title;
                dataToFind = {...dataToFind, title: {$regex: new RegExp(".*" + _req.query.title + ".*", "i")}}
                skip = 0;
            }

            const [query]: any = await Module.aggregate([{
                $facet: {
                    results: [
                        {$match: dataToFind},
                        {$skip: skip},
                        {$limit: perPage},
                        {$sort:{createdAt:-1}}
                    ],
                    moduleCount: [
                        {$match: dataToFind},
                        {$count: 'count'}
                    ]
                }
            }]);

            const moduleCount = query.moduleCount[0]?.count || 0;
            const totalPages = Math.ceil(moduleCount / perPage);

            return res.json({
                data: query.results,
                meta: {"perPage": perPage, "page": _req.query.page || 1, "pages": totalPages, "total": moduleCount,}
            });
        } catch (err) {
            console.log(err)
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }

    static show = async (req: Request, res: Response): Promise<Response> => {
        const {id} = req.params;

        try {
            const module = await Module.findById(id);

            if (module) {
                return res.json({data: module});
            }

            return res.status(404).json({error: {message: 'module not found.'}});

        } catch (err) {
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }

    static update = async (req: Request, res: Response): Promise<Response> => {
        const {id} = req.params;
        const input: UpdateModuleInput = req.body;
        try {
            const moduleData = await Module.findByIdAndUpdate(
                id,
                {
                    ...input
                },
                {
                    new: true,
                }
            );

            if (!moduleData) {
                return res.status(400).json({error: {message: 'module to update does not exists.'}});
            }

            return res.json({data: moduleData})
        } catch (err) {
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }

    static destroy = async (req: Request, res: Response): Promise<Response> => {
        const {id} = req.params;

        try {
            const moduleData = await Module.findByIdAndDelete(id);

            if (!moduleData) {
                return res.status(400).json({error: {message: 'Module to delete does not exists.'}});
            }

            return res.json({data: {message: 'Module deleted successfully.'}});
        } catch (err) {
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }


}
