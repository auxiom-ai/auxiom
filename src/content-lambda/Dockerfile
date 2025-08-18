FROM public.ecr.aws/lambda/python:3.12

# Install system packages for podcasts
# Install tar, xz-utils, and findutils for extracting ffmpeg
RUN microdnf update -y && \
    microdnf install -y tar xz findutils && \
    microdnf clean all

# Download and install a static build of ffmpeg
RUN cd /tmp && \
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz && \
    tar xf ffmpeg.tar.xz && \
    find . -name "ffmpeg" -type f -executable -exec cp {} /usr/local/bin/ \; && \
    find . -name "ffprobe" -type f -executable -exec cp {} /usr/local/bin/ \; && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe && \
    rm -rf /tmp/ffmpeg* && \
    cd ${LAMBDA_TASK_ROOT}

# Copy requirements.txt
COPY requirements.txt ${LAMBDA_TASK_ROOT}

# Install the specified packages
RUN pip install --no-cache-dir -r requirements.txt

COPY . ${LAMBDA_TASK_ROOT}

ENV HOME=/tmp
# ENV TRANSFORMERS_CACHE=/tmp
ENV HF_HOME=/tmp

CMD [ "service_dispatcher.handler" ]
