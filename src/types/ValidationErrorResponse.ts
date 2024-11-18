import { ValidationError } from 'class-validator';

export interface ValidationErrorResponse {
    property: ValidationError['property'],
    constraints: ValidationError['constraints'],
}
