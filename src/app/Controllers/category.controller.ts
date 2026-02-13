import {Request, Response} from 'express';
import {validate} from 'class-validator';
import {ValidationErrorResponse} from '../../types/ValidationErrorResponse';
import {Category} from '../Models/Category';
import {CreateCategoryInput} from "../Inputs/createCategory.input";
import {Module} from "../Models/Module";
import {CreateSubCategoryInput} from "../Inputs/CreateSubCategory.input";

const ObjectId = require('mongoose').Types.ObjectId;

const LIMIT = 10

export class CategoryController {
    static create = async (req: Request, res: Response): Promise<Response> => {
        const input: CreateCategoryInput = req.body;

        const categoryInput = new CreateCategoryInput();

        categoryInput.title = input.title;
        categoryInput.moduleId = input.moduleId;
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
            if (!ObjectId.isValid(input.moduleId)) {
                return res.status(400).json({error: {message: 'Invalid moduleId.'}});
            }
            const module = await Module.findById(input.moduleId);
            if (!module) {
                return res.status(400).json({error: {message: 'Invalid moduleId.'}});
            }
            const dataToSave: any = {
                title: input.title,
                moduleId: input.moduleId,
                isActive: true
            }

            const category = await Category.create(dataToSave);

            return res.json({data: category, message: "category created sucessfully"})
        } catch (err) {
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }



    static index = async (_req: any, res: Response): Promise<Response> => {
        try {
            const perPage = (_req.query && _req.query.perPage > 0 ? parseInt(_req.query.perPage) : LIMIT);
            let skip = (_req.query && _req.query.page > 0 ? parseInt(_req.query.page) - 1 : 0) * perPage;

            let dataToFind: any = {isActive: true};

            if (_req.query.title) {
                dataToFind.title = _req.query.title;
                const escapedTitle = String(_req.query.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                dataToFind = {...dataToFind, title: {$regex: new RegExp(".*" + escapedTitle + ".*", "i")}}
                skip = 0;
            }

            if (_req.query.moduleId) {
                dataToFind.moduleId = _req.query.moduleId;
                dataToFind = {...dataToFind, moduleId: ObjectId(_req.query.moduleId)};
                skip = 0;
            }
            const [query]: any = await Category.aggregate([{
                $facet: {
                    results: [
                        {$match: dataToFind},
                        // { $lookup: {from: 'Module', localField: 'moduleId', foreignField: 'id', as: 'module'}},
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

            const categoryCount = query.moduleCount[0]?.count || 0;
            const totalPages = Math.ceil(categoryCount / perPage);

            return res.json({
                data: query.results,
                meta: {"perPage": perPage, "page": _req.query.page || 1, "pages": totalPages, "total": categoryCount,}
            });
        } catch (err) {
            console.log(err)
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }

    static show = async (req: Request, res: Response): Promise<Response> => {
        const {id} = req.params;

        try {
            const category = await Category.findById(id).populate('moduleId');

            if (category) {
                return res.json({data: {category}});
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
            const dataToSave: any = {...input};
            const categoryData = await Category.findByIdAndUpdate(
                id,
                {
                    ...dataToSave
                }
            );

            if (!categoryData) {
                return res.status(400).json({error: {message: 'category to update does not exists.'}});
            }
            const categoryUpdatedData = await Category.findById(
                id,
                '-isActive -activatedAt -isDeleted -deletedAt'
            )
           

            return res.json({data: {categoryUpdatedData}})
        } catch (err) {
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }

    static destroy = async (req: Request, res: Response): Promise<Response> => {
        const {id} = req.params;

        try {
            const categoryData = await Category.findByIdAndUpdate(
                id,
                {
                    isDeleted: true,
                    deletedAt: new Date()
                }
            );

            if (!categoryData) {
                return res.status(400).json({error: {message: 'category to delete does not exists.'}});
            }

            return res.json({data: {message: 'category deleted successfully.'}});
        } catch (err) {
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }

    static createSubCategory = async (req: Request, res: Response): Promise<Response> => {
        const input: CreateSubCategoryInput = req.body;

        const categoryInput = new CreateSubCategoryInput();

        categoryInput.title = input.title;
        categoryInput.categoryId = input.categoryId;
        const errors = await validate(categoryInput);

        if (errors.length) {
            const errorsInfo: ValidationErrorResponse[] = errors.map(error => ({
                property: error.property,
                constraints: error.constraints
            }));

            return res.status(400).json({error: {message: 'VALIDATIONS_ERROR', info: errorsInfo}});
        }

        try {
            if (!ObjectId.isValid(input.categoryId)) {
                return res.status(400).json({error: {message: 'Invalid categoryId.'}});
            }
            const category = await Category.findById(input.categoryId)
            if (!category) {
                return res.status(400).json({error: {message: 'Invalid categoryId.'}});
            }
            const subCategory=await Category.create({title: input.title, parentId: input.categoryId,isActive:true})
            const categoryData = await Category.findById(subCategory.id, '-isActive -activatedAt -isDeleted -deletedAt').populate('parentId')

            return res.json({data: categoryData, message: 'sub category created successfully.'});
        } catch (err) {
            console.log("ERR",err)
            return res.status(500).json({error: {message: 'Something went wrong.'}});
        }
    }

}
