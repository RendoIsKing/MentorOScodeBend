import {Request, Response} from 'express';
import {validate} from 'class-validator';
import {ValidationErrorResponse} from '../../types/ValidationErrorResponse';
import {UpdateModuleInput} from "../Inputs/UpdateModule.input";
import {
  findById,
  findOne,
  insertOne,
  updateById,
  deleteById,
  Tables,
  db,
} from '../../lib/db';

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
            const checkModule = await findOne(Tables.MODULES, {title: input.title});

            // @ts-ignore
            if (checkModule) {
                return res.status(400).json({error: {message: 'module already preset with same name.'}});
            }
            const moduleData = await insertOne(Tables.MODULES, {
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
            const page = (_req.query && _req.query.page > 0 ? parseInt(_req.query.page) : 1);
            const offset = (page - 1) * perPage;

            let countQuery = db
                .from(Tables.MODULES)
                .select("id", { count: "exact", head: true });
            let dataQuery = db
                .from(Tables.MODULES)
                .select("*")
                .order("created_at", { ascending: false })
                .range(offset, offset + perPage - 1);

            if (_req.query?.title) {
                const search = `%${_req.query.title}%`;
                countQuery = countQuery.ilike("title", search);
                dataQuery = dataQuery.ilike("title", search);
            }

            const [{ count: moduleCount }, { data: results, error }] = await Promise.all([
                countQuery,
                dataQuery,
            ]);

            if (error) {
                return res.status(500).json({error: {message: 'Something went wrong.'}});
            }

            const total = moduleCount || 0;
            const totalPages = Math.ceil(total / perPage);

            return res.json({
                data: results || [],
                meta: {"perPage": perPage, "page": page, "pages": totalPages, "total": total,}
            });
        } catch (err) {
            console.log(err)
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }

    static show = async (req: Request, res: Response): Promise<Response> => {
        const {id} = req.params;

        try {
            const module = await findById(Tables.MODULES, id);

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
            const moduleData = await updateById(Tables.MODULES, id, {...input});

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
            const deleted = await deleteById(Tables.MODULES, id);

            if (!deleted) {
                return res.status(400).json({error: {message: 'Module to delete does not exists.'}});
            }

            return res.json({data: {message: 'Module deleted successfully.'}});
        } catch (err) {
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }


}
