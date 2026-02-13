import {Request, Response} from 'express';
import {validate} from 'class-validator';
import {ValidationErrorResponse} from '../../types/ValidationErrorResponse';
import {CreateCategoryInput} from "../Inputs/createCategory.input";
import {CreateSubCategoryInput} from "../Inputs/CreateSubCategory.input";
import {
  findById,
  insertOne,
  updateById,
  softDelete,
  Tables,
  db,
} from '../../lib/db';

const isValidUUID = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const LIMIT = 10;

export class CategoryController {
    static create = async (req: Request, res: Response): Promise<Response> => {
        const input: CreateCategoryInput = req.body;

        const categoryInput = new CreateCategoryInput();

        categoryInput.title = input.title;
        categoryInput.moduleId = input.moduleId as any;
        const errors = await validate(categoryInput);
        if (errors.length) {
            const errorsInfo: ValidationErrorResponse[] = errors.map(error => ({
                property: error.property,
                constraints: error.constraints
            }));

            return res.status(400).json({error: {message: 'VALIDATIONS_ERROR', info: errorsInfo}});
        }
        if(!input.title){
            return res.status(400).json({error: {message: 'VALIDATIONS_ERROR', info: "title is required"}});
        }
        try {
            if (!isValidUUID(String(input.moduleId))) {
                return res.status(400).json({error: {message: 'Invalid moduleId.'}});
            }
            const module = await findById(Tables.MODULES, String(input.moduleId));
            if (!module) {
                return res.status(400).json({error: {message: 'Invalid moduleId.'}});
            }
            const dataToSave = {
                title: input.title,
                module_id: String(input.moduleId),
                is_active: true,
            };

            const category = await insertOne(Tables.CATEGORIES, dataToSave);

            return res.json({data: category, message: "category created sucessfully"})
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
                .from(Tables.CATEGORIES)
                .select("id", { count: "exact", head: true })
                .eq("is_active", true)
                .or("is_deleted.is.null,is_deleted.eq.false");
            let dataQuery = db
                .from(Tables.CATEGORIES)
                .select("*")
                .eq("is_active", true)
                .or("is_deleted.is.null,is_deleted.eq.false")
                .order("created_at", { ascending: false })
                .range(offset, offset + perPage - 1);

            if (_req.query?.title) {
                const search = `%${_req.query.title}%`;
                countQuery = countQuery.ilike("title", search);
                dataQuery = dataQuery.ilike("title", search);
            }

            if (_req.query?.moduleId) {
                countQuery = countQuery.eq("module_id", _req.query.moduleId);
                dataQuery = dataQuery.eq("module_id", _req.query.moduleId);
            }

            const [{ count: categoryCount }, { data: results, error }] = await Promise.all([
                countQuery,
                dataQuery,
            ]);

            if (error) {
                return res.status(500).json({error: {message: 'Something went wrong.'}});
            }

            const total = categoryCount || 0;
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
            const category = await findById(Tables.CATEGORIES, id);

            if (category) {
                const module = (category as any).module_id
                    ? await findById(Tables.MODULES, (category as any).module_id)
                    : null;
                return res.json({
                    data: {
                        category: {
                            ...category,
                            module, // populated module (replaces moduleId in Mongoose populate)
                        },
                    },
                });
            }

            return res.status(404).json({error: {message: 'category not found.'}});

        } catch (err) {
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }

    static update = async (req: Request, res: Response): Promise<Response> => {
        const {id} = req.params;
        const input: CreateCategoryInput = req.body;
        try {
            const snakeCaseData: Record<string, any> = {};
            if (input.title != null) snakeCaseData.title = input.title;
            if (input.moduleId != null) snakeCaseData.module_id = input.moduleId;

            const categoryData = await updateById(Tables.CATEGORIES, id, snakeCaseData);

            if (!categoryData) {
                return res.status(400).json({error: {message: 'category to update does not exists.'}});
            }

            const categoryUpdatedData = await findById(Tables.CATEGORIES, id);

            return res.json({data: {categoryUpdatedData}})
        } catch (err) {
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }

    static destroy = async (req: Request, res: Response): Promise<Response> => {
        const {id} = req.params;

        try {
            const existing = await findById(Tables.CATEGORIES, id);
            if (!existing) {
                return res.status(400).json({error: {message: 'category to delete does not exists.'}});
            }
            await softDelete(Tables.CATEGORIES, id);
            return res.json({data: {message: 'category deleted successfully.'}});
        } catch (err) {
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }

    static createSubCategory = async (req: Request, res: Response): Promise<Response> => {
        const input: CreateSubCategoryInput = req.body;

        const categoryInput = new CreateSubCategoryInput();

        categoryInput.title = input.title;
        categoryInput.categoryId = input.categoryId as any;
        const errors = await validate(categoryInput);

        if (errors.length) {
            const errorsInfo: ValidationErrorResponse[] = errors.map(error => ({
                property: error.property,
                constraints: error.constraints
            }));

            return res.status(400).json({error: {message: 'VALIDATIONS_ERROR', info: errorsInfo}});
        }

        try {
            if (!isValidUUID(String(input.categoryId))) {
                return res.status(400).json({error: {message: 'Invalid categoryId.'}});
            }
            const category = await findById(Tables.CATEGORIES, String(input.categoryId));
            if (!category) {
                return res.status(400).json({error: {message: 'Invalid categoryId.'}});
            }
            const subCategory = await insertOne(Tables.CATEGORIES, {
                title: input.title,
                parent_id: String(input.categoryId),
                module_id: (category as any).module_id ?? null,
                is_active: true,
            });
            if (!subCategory) {
                return res.status(500).json({error: {message: 'Something went wrong.'}});
            }
            const parent = (subCategory as any).parent_id
                ? await findById(Tables.CATEGORIES, (subCategory as any).parent_id)
                : null;
            const categoryData = {
                ...subCategory,
                parent: parent, // populated parent (replaces parentId in Mongoose populate)
            };

            return res.json({data: categoryData, message: 'sub category created successfully.'});
        } catch (err) {
            console.log("ERR", err);
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }

}
