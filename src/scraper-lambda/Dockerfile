FROM public.ecr.aws/lambda/python:3.12

# Copy requirements.txt
#COPY src/service_tier/requirements.txt ${LAMBDA_TASK_ROOT}
COPY requirements.txt ${LAMBDA_TASK_ROOT}

# Install the specified packages
RUN pip install -r requirements.txt

COPY . ${LAMBDA_TASK_ROOT}

# Set the CMD to your handler (could also be done as a parameter override outside of the Dockerfile)
CMD [ "service_dispatcher.handler" ]
